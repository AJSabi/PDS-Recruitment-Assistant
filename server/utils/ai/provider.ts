/**
 * AI Provider Abstraction Layer
 *
 * Supports OpenAI, Anthropic, Google, and custom OpenAI-compatible endpoints.
 * Credentials are decrypted per-request from the organization's AI config.
 * Never logs or stores raw API keys — only encrypted values in the database.
 */
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateObject } from 'ai'
import type { z } from 'zod'
import { decrypt } from '../encryption'

export type SupportedProvider = 'openai' | 'anthropic' | 'google' | 'openai_compatible'

export interface ProviderConfig {
  provider: SupportedProvider
  model: string
  apiKeyEncrypted: string
  baseUrl?: string | null
  maxTokens: number
}

export interface ModelInfo {
  id: string
  label: string
  description: string
  inputPricePer1m?: number
  outputPricePer1m?: number
  badge?: 'recommended' | 'fast' | 'powerful' | 'cheap'
}

export const PROVIDER_REGISTRY: Record<string, {
  name: string
  tagline: string
  modelsUrl: string
  apiKeyUrl: string
  signupUrl?: string
  supportsBaseUrl: boolean
  defaultModel: string
  models: ModelInfo[]
}> = {
  openai: {
    name: 'OpenAI',
    tagline: 'Industry-leading GPT models. The safest default for most teams.',
    modelsUrl: 'https://platform.openai.com/docs/models',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    signupUrl: 'https://platform.openai.com/signup',
    supportsBaseUrl: false,
    defaultModel: 'gpt-4.1-mini',
    models: [
      { id: 'gpt-4.1', label: 'GPT-4.1', description: 'Flagship model — highest accuracy for complex reasoning.', inputPricePer1m: 2.0, outputPricePer1m: 8.0, badge: 'powerful' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', description: 'Best balance of price, speed and quality. Recommended default.', inputPricePer1m: 0.4, outputPricePer1m: 1.6, badge: 'recommended' },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', description: 'Fastest and cheapest GPT-4.1. Great for high-volume scoring.', inputPricePer1m: 0.1, outputPricePer1m: 0.4, badge: 'cheap' },
      { id: 'gpt-4o', label: 'GPT-4o', description: 'Multimodal flagship from the GPT-4o family.', inputPricePer1m: 2.5, outputPricePer1m: 10.0 },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'Older small model — keep for cost compatibility.', inputPricePer1m: 0.15, outputPricePer1m: 0.6 },
      { id: 'o3', label: 'o3', description: 'Reasoning model — slow but excellent at multi-step problems.', inputPricePer1m: 2.0, outputPricePer1m: 8.0 },
      { id: 'o4-mini', label: 'o4 Mini', description: 'Smaller reasoning model — good price/quality for scoring.', inputPricePer1m: 1.1, outputPricePer1m: 4.4 },
    ],
  },
  anthropic: {
    name: 'Anthropic',
    tagline: 'Claude models — strong at long-form analysis and nuanced writing.',
    modelsUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    signupUrl: 'https://console.anthropic.com/',
    supportsBaseUrl: false,
    defaultModel: 'claude-sonnet-4-20250514',
    models: [
      { id: 'claude-opus-4-20250514', label: 'Claude Opus 4', description: 'Anthropic\'s most capable model. Best for the toughest analyses.', inputPricePer1m: 15.0, outputPricePer1m: 75.0, badge: 'powerful' },
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', description: 'The sweet spot — strong reasoning at a sensible price.', inputPricePer1m: 3.0, outputPricePer1m: 15.0, badge: 'recommended' },
      { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', description: 'Fast and inexpensive. Great for chat and quick scoring.', inputPricePer1m: 0.8, outputPricePer1m: 4.0, badge: 'fast' },
    ],
  },
  google: {
    name: 'Google AI (Gemini)',
    tagline: 'Gemini models — generous free tier and very fast inference.',
    modelsUrl: 'https://ai.google.dev/gemini-api/docs/models',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    signupUrl: 'https://aistudio.google.com/',
    supportsBaseUrl: false,
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Google\'s top model — strong at reasoning and long contexts.', inputPricePer1m: 1.25, outputPricePer1m: 10.0, badge: 'powerful' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Excellent quality at a very low price. Recommended default.', inputPricePer1m: 0.3, outputPricePer1m: 2.5, badge: 'recommended' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: 'Previous-gen fast model. Still solid and very cheap.', inputPricePer1m: 0.1, outputPricePer1m: 0.4, badge: 'cheap' },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', description: 'Cheapest Gemini option for high-volume light tasks.', inputPricePer1m: 0.075, outputPricePer1m: 0.3, badge: 'cheap' },
    ],
  },
  openai_compatible: {
    name: 'OpenAI-Compatible (Custom)',
    tagline: 'Connect any OpenAI-compatible endpoint: Ollama, LM Studio, OpenRouter, Groq, Together AI, vLLM, …',
    modelsUrl: '',
    apiKeyUrl: '',
    supportsBaseUrl: true,
    defaultModel: '',
    models: [],
  },
}

export function createLanguageModel(config: ProviderConfig) {
  const secret = env.BETTER_AUTH_SECRET
  const apiKey = decrypt(config.apiKeyEncrypted, secret)

  if (!apiKey) {
    throw createError({
      statusCode: 422,
      statusMessage: 'AI connection is unavailable because the configured API key could not be decrypted. Re-enter the key in Settings → AI.',
    })
  }

  switch (config.provider) {
    case 'openai':
    case 'openai_compatible': {
      const openai = createOpenAI({
        apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      })
      return openai(config.model)
    }
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      })
      return anthropic(config.model)
    }
    case 'google': {
      const google = createGoogleGenerativeAI({
        apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      })
      return google(config.model)
    }
    default:
      throw createError({ statusCode: 422, statusMessage: 'The selected AI provider is not supported. Check Settings → AI.' })
  }
}

function providerErrorText(error: any) {
  return [
    error?.code,
    error?.data?.code,
    error?.type,
    error?.data?.type,
    error?.message,
    error?.data?.message,
    error?.responseBody,
  ].filter(Boolean).join(' ').toLowerCase()
}

/** Convert provider/SDK failures into safe, recruiter-facing errors without leaking credentials or raw provider payloads. */
export function normalizeAiProviderError(error: any): never {
  // Preserve deliberate application errors that already have a useful message.
  if (error?.statusCode && error?.statusMessage && !String(error.statusMessage).toLowerCase().includes('server error')) throw error

  const text = providerErrorText(error)
  const providerStatus = Number(error?.statusCode ?? error?.status ?? error?.response?.status ?? 0)

  if (text.includes('insufficient_quota') || text.includes('exceeded your current quota') || text.includes('billing') && text.includes('quota')) {
    throw createError({
      statusCode: 402,
      statusMessage: 'AI quota or credits are exhausted. Check the provider billing/usage, then retry.',
    })
  }

  if (text.includes('invalid_api_key') || text.includes('incorrect api key') || text.includes('authentication') || providerStatus === 401) {
    throw createError({
      statusCode: 422,
      statusMessage: 'AI authentication failed. Check the API key in Settings → AI and test the connection.',
    })
  }

  if (text.includes('model_not_found') || text.includes('model not found') || text.includes('does not exist') && text.includes('model')) {
    throw createError({
      statusCode: 422,
      statusMessage: 'The configured AI model is unavailable or not accessible. Choose another model in Settings → AI.',
    })
  }

  if (text.includes('invalid_json_schema') || text.includes('invalid schema') || text.includes('response_format') || text.includes('schema validation')) {
    throw createError({
      statusCode: 422,
      statusMessage: 'AI could not produce the required structured response. Please retry; if it persists, the AI workflow needs technical review.',
    })
  }

  if (text.includes('rate limit') || text.includes('rate_limit') || providerStatus === 429) {
    throw createError({
      statusCode: 429,
      statusMessage: 'AI request limit reached. Wait briefly and retry.',
    })
  }

  if (text.includes('timeout') || text.includes('timed out') || text.includes('fetch failed') || text.includes('connection') || text.includes('network') || providerStatus >= 500) {
    throw createError({
      statusCode: 503,
      statusMessage: 'AI service is temporarily unavailable. Retry in a moment. Your recruitment data has not been lost.',
    })
  }

  throw createError({
    statusCode: 502,
    statusMessage: 'AI processing could not be completed. Retry once; if the issue continues, check Settings → AI.',
  })
}

export async function generateStructuredOutput<T>(
  config: ProviderConfig,
  options: {
    system: string
    prompt: string
    schema: z.ZodType<T>
    schemaName: string
    schemaDescription?: string
  },
): Promise<{ object: T; usage: { promptTokens: number; completionTokens: number } }> {
  try {
    const model = createLanguageModel(config)
    const result = await generateObject({
      model,
      system: options.system,
      prompt: options.prompt,
      schema: options.schema,
      schemaName: options.schemaName,
      schemaDescription: options.schemaDescription,
      maxTokens: config.maxTokens,
      temperature: 0.1,
    })

    return {
      object: result.object,
      usage: {
        promptTokens: result.usage.inputTokens ?? 0,
        completionTokens: result.usage.outputTokens ?? 0,
      },
    }
  } catch (error: any) {
    normalizeAiProviderError(error)
  }
}
