"""
Reverse proxy that fits the Emergent platform routing model.

Emergent's ingress sends every `/api/*` request to port 8001 (this process)
and everything else to port 3000 (the Nuxt server). Reqcore is a single Nuxt
app that serves BOTH its UI and its `/api/*` routes on port 3000, so this proxy
forwards the `/api/*` (and auth) traffic it receives on 8001 to the Nuxt server
on 3000.

Normal API responses are buffered before headers are returned to the browser.
This lets transient upstream transport failures become a controlled 502 rather
than a browser-level "Failed to fetch" connection reset. Event-stream responses
remain streamed so SSE/AI features continue to work.

Cloudflare (the platform ingress) rewrites the incoming `Host`/`Origin` headers
to an internal `*.emergentcf.cloud` domain while preserving the real public
domain in `x-forwarded-host`. better-auth performs a strict Origin check against
its configured base URL (the public preview domain), so this proxy realigns the
`Origin`/`Host`/`Referer` headers to the public host before forwarding.
"""
import asyncio

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

NUXT_ORIGIN = "http://127.0.0.1:3000"

app = FastAPI()

# Do not reuse upstream TCP connections in the Emergent preview environment.
# Pods/services may suspend or restart between requests, making pooled
# keep-alive connections prone to intermittent httpx.ReadError failures.
client = httpx.AsyncClient(
    base_url=NUXT_ORIGIN,
    timeout=httpx.Timeout(300.0),
    limits=httpx.Limits(max_keepalive_connections=0),
)

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


def _response_headers(upstream: httpx.Response) -> dict[str, str]:
    return {
        k: v for k, v in upstream.headers.items()
        if k.lower() not in _HOP_BY_HOP
    }


async def _send_with_retry(req: httpx.Request) -> httpx.Response:
    """Retry once when the upstream disconnects before response delivery begins."""
    last_error: httpx.TransportError | None = None
    for attempt in range(2):
        try:
            return await client.send(req, stream=True)
        except httpx.TransportError as exc:
            last_error = exc
            if attempt == 0:
                await asyncio.sleep(0.15)
                continue
            break
    assert last_error is not None
    raise last_error


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

    try:
        upstream = await _send_with_retry(req)
    except httpx.TransportError as exc:
        return JSONResponse(
            status_code=502,
            content={
                "statusCode": 502,
                "statusMessage": "Recruitment service temporarily unavailable. Please retry.",
                "error": type(exc).__name__,
            },
        )

    resp_headers = _response_headers(upstream)
    content_type = upstream.headers.get("content-type", "")

    # SSE must remain streamed. If an upstream disconnect occurs after SSE
    # headers have already been sent, HTTP cannot replace that partial response
    # with JSON; the generator still guarantees upstream cleanup.
    if content_type.lower().startswith("text/event-stream"):
        async def body_iter():
            try:
                async for chunk in upstream.aiter_raw():
                    yield chunk
            finally:
                await upstream.aclose()

        return StreamingResponse(
            body_iter(),
            status_code=upstream.status_code,
            headers=resp_headers,
            media_type=content_type,
        )

    # Buffer normal API responses before returning headers. A ReadError while
    # Nitro is producing JSON/file content can therefore be converted to 502
    # rather than abruptly terminating the browser connection.
    try:
        content = await upstream.aread()
    except httpx.TransportError as exc:
        await upstream.aclose()
        return JSONResponse(
            status_code=502,
            content={
                "statusCode": 502,
                "statusMessage": "Recruitment service connection was interrupted. Please retry.",
                "error": type(exc).__name__,
            },
        )
    finally:
        if not upstream.is_closed:
            await upstream.aclose()

    return Response(
        content=content,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=content_type or None,
    )
