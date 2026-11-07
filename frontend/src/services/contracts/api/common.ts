export type ApiId = string
export type IsoTimestamp = string

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'validation_error'
  | 'rate_limited'
  | 'server_error'
  | 'service_unavailable'

export type ApiErrorDetail = {
  field?: string | null
  message: string
  code?: string | null
}

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode
    message: string
    requestId?: string | null
    details?: ApiErrorDetail[] | null
  }
}

export type ApiPage<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
  hasNext: boolean
}

export type ApiSourceReference = {
  documentId?: ApiId | null
  title: string
  page?: number | null
  excerpt?: string | null
  locator?: string | null
}

export type ApiStatus = 'active' | 'archived' | 'deleted'
