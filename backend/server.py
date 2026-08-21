"""
Reverse proxy that fits the Emergent platform routing model.

Emergent's ingress sends every `/api/*` request to port 8001 (this process)
and everything else to port 3000 (the Nuxt server). Reqcore is a single Nuxt
app that serves BOTH its UI and its `/api/*` routes on port 3000, so this proxy
forwards the `/api/*` (and auth) traffic it receives on 8001 to the Nuxt server
on 3000, streaming responses so SSE (AI chat/analysis) keeps working.

Cloudflare (the platform ingress) rewrites the incoming `Host`/`Origin` headers
to an internal `*.emergentcf.cloud` domain while preserving the real public
domain in `x-forwarded-host`. better-auth performs a strict Origin check against
its configured base URL (the public preview domain), so this proxy realigns the
`Origin`/`Host`/`Referer` headers to the public host before forwarding.
"""
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

NUXT_ORIGIN = "http://127.0.0.1:3000"

app = FastAPI()

client = httpx.AsyncClient(base_url=NUXT_ORIGIN, timeout=httpx.Timeout(300.0))

# Hop-by-hop headers that must not be forwarded.
_HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "content-encoding",
    "content-length",
}


def _public_host(request: Request) -> str | None:
    xfh = request.headers.get("x-forwarded-host")
    if xfh:
        return xfh.split(",")[0].strip()
    return None


@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy(path: str, request: Request):
    url = httpx.URL(path="/" + path, query=request.url.query.encode("utf-8"))

    fwd_headers = {
        k: v for k, v in request.headers.items() if k.lower() != "host"
    }

    # Realign Origin/Host/Referer to the real public host so better-auth's
    # origin check matches its configured base URL.
    public_host = _public_host(request)
    if public_host:
        proto = request.headers.get("x-forwarded-proto", "https").split(",")[0].strip()
        public_origin = f"{proto}://{public_host}"
        fwd_headers["host"] = public_host
        if "origin" in fwd_headers:
            fwd_headers["origin"] = public_origin
        ref = fwd_headers.get("referer")
        if ref:
            try:
                after = ref.split("://", 1)[1]
                path_part = after.split("/", 1)
                tail = "/" + path_part[1] if len(path_part) > 1 else ""
                fwd_headers["referer"] = f"{public_origin}{tail}"
            except (IndexError, ValueError):
                pass

    body = await request.body()
    req = client.build_request(
        request.method, url, headers=fwd_headers, content=body
    )
    upstream = await client.send(req, stream=True)

    resp_headers = {
        k: v for k, v in upstream.headers.items()
        if k.lower() not in _HOP_BY_HOP
    }

    async def body_iter():
        async for chunk in upstream.aiter_raw():
            yield chunk
        await upstream.aclose()

    return StreamingResponse(
        body_iter(),
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type"),
    )
