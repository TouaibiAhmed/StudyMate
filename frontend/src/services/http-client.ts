export type ApiResponse<T> = {
  data: T
  status: number
  headers: Headers
}

export type ApiErrorCode =
  | 'bad-request'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'payload-too-large'
  | 'validation'
  | 'rate-limited'
  | 'server-error'
  | 'service-unavailable'
  | 'network-error'
  | 'timeout'
  | 'cancelled'
  | 'unknown'

export type ApiErrorPayload = {
  message: string
  code: ApiErrorCode
  status?: number
  details?: unknown
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status?: number
  readonly details?: unknown

  constructor(payload: ApiErrorPayload) {
    super(payload.message)
    this.name = 'ApiError'
    this.code = payload.code
    this.status = payload.status
    this.details = payload.details
  }
}

export type ApiRequestOptions = Omit<RequestInit, 'body' | 'headers' | 'signal'> & {
  body?: unknown
  headers?: HeadersInit
  signal?: AbortSignal
  timeoutMs?: number
}

export type ApiClientOptions = {
  baseUrl?: string
  credentials?: RequestCredentials
  getAccessToken?: () => string | undefined
  defaultTimeoutMs?: number
}

const statusCodes: Record<number, { code: ApiErrorCode; message: string }> = {
  400: { code: 'bad-request', message: 'The request could not be understood.' },
  401: { code: 'unauthorized', message: 'Your session is not authorized.' },
  403: { code: 'forbidden', message: 'You do not have permission to perform this action.' },
  404: { code: 'not-found', message: 'The requested resource was not found.' },
  409: { code: 'conflict', message: 'This action conflicts with the current resource state.' },
  413: { code: 'payload-too-large', message: 'The uploaded payload is too large.' },
  422: { code: 'validation', message: 'Some request fields are invalid.' },
  429: { code: 'rate-limited', message: 'Too many requests. Try again shortly.' },
  500: { code: 'server-error', message: 'The server could not complete the request.' },
  503: { code: 'service-unavailable', message: 'The service is temporarily unavailable.' },
}

function joinUrl(baseUrl: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.headers.get('content-length') === '0') return undefined
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch {
      return undefined
    }
  }
  const text = await response.text()
  return text || undefined
}

function messageFromPayload(payload: unknown, fallback: string) {
  // Backend error shape: { error: { code, message, requestId, details } }
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const error = payload.error
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      return error.message
    }
  }
  if (typeof payload === 'object' && payload !== null && 'detail' in payload) {
    const detail = payload.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return 'One or more request fields are invalid.'
  }
  if (typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string') return payload.message
  return fallback
}

function createAbortController(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  return {
    signal: controller.signal,
    wasTimedOut: () => timedOut,
    cleanup: () => {
      window.clearTimeout(timeoutId)
      signal?.removeEventListener('abort', abort)
    },
  }
}

export class ApiClient {
  private readonly baseUrl: string
  private readonly credentials: RequestCredentials
  private readonly getAccessToken?: () => string | undefined
  private readonly defaultTimeoutMs: number

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? ''
    this.credentials = options.credentials ?? 'include'
    this.getAccessToken = options.getAccessToken
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 15_000
  }

  request<T>(path: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    return this.send<T>(path, options)
  }

  get<T>(path: string, options?: ApiRequestOptions) {
    return this.send<T>(path, { ...options, method: 'GET' })
  }

  post<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
    return this.send<T>(path, { ...options, method: 'POST', body })
  }

  put<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
    return this.send<T>(path, { ...options, method: 'PUT', body })
  }

  patch<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
    return this.send<T>(path, { ...options, method: 'PATCH', body })
  }

  delete<T = undefined>(path: string, options?: ApiRequestOptions) {
    return this.send<T>(path, { ...options, method: 'DELETE' })
  }

  upload<T>(path: string, formData: FormData, options?: Omit<ApiRequestOptions, 'body'>) {
    return this.send<T>(path, { ...options, method: 'POST', body: formData })
  }

  private async send<T>(path: string, options: ApiRequestOptions): Promise<ApiResponse<T>> {
    const { body, headers: providedHeaders, signal, timeoutMs = this.defaultTimeoutMs, ...requestInit } = options
    const headers = new Headers(providedHeaders)
    const token = this.getAccessToken?.()
    if (token) headers.set('Authorization', `Bearer ${token}`)

    let requestBody: BodyInit | undefined
    if (body instanceof FormData || body instanceof Blob || typeof body === 'string' || body instanceof URLSearchParams) {
      requestBody = body
    } else if (body !== undefined) {
      headers.set('Content-Type', 'application/json')
      requestBody = JSON.stringify(body)
    }

    const abort = createAbortController(signal, timeoutMs)
    try {
      const response = await fetch(joinUrl(this.baseUrl, path), {
        ...requestInit,
        body: requestBody,
        credentials: this.credentials,
        headers,
        signal: abort.signal,
      })
      const payload = await readResponseBody(response)
      if (!response.ok) {
        const statusError = statusCodes[response.status] ?? { code: 'unknown' as const, message: 'The request failed.' }
        throw new ApiError({
          code: statusError.code,
          status: response.status,
          message: messageFromPayload(payload, statusError.message),
          details: payload,
        })
      }
      return { data: payload as T, status: response.status, headers: response.headers }
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (abort.wasTimedOut()) throw new ApiError({ code: 'timeout', message: `The request timed out after ${timeoutMs}ms.` })
      if (signal?.aborted) throw new ApiError({ code: 'cancelled', message: 'The request was cancelled.' })
      throw new ApiError({ code: 'network-error', message: 'The server could not be reached.', details: error })
    } finally {
      abort.cleanup()
    }
  }
}

let inMemoryAccessToken: string | undefined = undefined

export function setApiAccessToken(token: string | undefined) {
  inMemoryAccessToken = token
}

export function getApiAccessToken(): string | undefined {
  return inMemoryAccessToken
}

export const apiClient = new ApiClient({
  getAccessToken: getApiAccessToken,
})
