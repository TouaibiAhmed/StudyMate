import type {
  ChatConversationDetailDto,
  ChatConversationDto,
  ChatConversationListDto,
  ChatMessageDto,
  CreateConversationRequestDto,
  PatchConversationRequestDto,
  SendChatMessageRequestDto,
  SendChatMessageResponseDto,
} from '../contracts/api/chat'
import type { ApiSourceReference } from '../contracts/api/common'
import type { ChatContext, ChatConversation, ChatMessage, ChatService, ChatSource, ChatStreamHandlers, CreateConversationInput } from '../contracts/chat'
import type { ApiErrorCode } from '../http-client'
import { ApiError, apiClient } from '../http-client'

// ---------------------------------------------------------------------------
// Module-level state
//
// messageCache persists across React re-renders for the session lifetime.
// It is the single source of truth for message content — the API list endpoint
// returns conversation metadata only; messages are fetched on first access and
// updated after every sendMessage() call.
// ---------------------------------------------------------------------------

const messageCache = new Map<string, ChatMessage[]>()

// Rate-limit cooldown: epoch ms after which sending is permitted again
let rateLimitUntil = 0

function checkRateLimit(): void {
  if (Date.now() < rateLimitUntil) {
    const seconds = Math.ceil((rateLimitUntil - Date.now()) / 1000)
    throw new ApiError({
      code: 'rate-limited',
      status: 429,
      message: `Too many messages. Please wait ${seconds} second${seconds !== 1 ? 's' : ''} before sending again.`,
    })
  }
}

function handleRateLimitResponse(error: unknown, retryAfterHeader?: string | null): never {
  const delay = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 60_000
  rateLimitUntil = Date.now() + (isNaN(delay) ? 60_000 : delay)
  if (error instanceof ApiError) throw error
  throw new ApiError({ code: 'rate-limited', status: 429, message: 'Too many messages. Please wait a moment before sending again.' })
}

// ---------------------------------------------------------------------------
// DTO mapping helpers
// ---------------------------------------------------------------------------

function mapSourceReference(ref: ApiSourceReference): ChatSource {
  return {
    title: ref.title || 'Source',
    page: typeof ref.page === 'number' ? ref.page : undefined,
    excerpt: ref.excerpt ?? undefined,
  }
}

function mapMessageDto(dto: ChatMessageDto): ChatMessage {
  const role: ChatMessage['role'] = dto.role === 'user' ? 'user' : 'assistant'
  const sources = dto.sources?.length ? dto.sources.map(mapSourceReference) : undefined
  return {
    id: dto.id,
    role,
    content: dto.content,
    createdAt: dto.createdAt,
    sources,
    knowledgeMode: dto.knowledgeMode ?? undefined,
    status: dto.status ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// Server-Sent Events (streamed answers)
//
// EventSource only supports GET, so the stream is read from a fetch() body.
// Events: user -> meta -> delta* -> done | error  (see backend chat/router.py)
// ---------------------------------------------------------------------------

const STATUS_CODES: Record<number, ApiErrorCode> = {
  400: 'bad-request', 401: 'unauthorized', 403: 'forbidden', 404: 'not-found', 409: 'conflict',
  422: 'validation', 429: 'rate-limited', 503: 'service-unavailable',
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  let message = 'The assistant could not respond.'
  try {
    const body = await response.json() as { error?: { message?: string } }
    if (body.error?.message) message = body.error.message
  } catch {
    // keep the generic message
  }
  return new ApiError({ code: STATUS_CODES[response.status] ?? 'server-error', status: response.status, message })
}

type SseEvent = { event: string; data: unknown }

async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      let event = 'message'
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      if (data.length) yield { event, data: JSON.parse(data.join('\n')) }
      boundary = buffer.indexOf('\n\n')
    }
  }
}

function mapContextDto(dto: ChatConversationDto['context'], fallback?: ChatContext): ChatContext {
  const type = (dto.type === 'general' || dto.type === 'course' || dto.type === 'topic') ? dto.type : 'general'
  return {
    type,
    courseId: dto.courseId ?? undefined,
    courseTitle: dto.courseTitle ?? fallback?.courseTitle,
    topicId: dto.topicId ?? undefined,
    topicTitle: dto.topicTitle ?? fallback?.topicTitle,
  }
}

function mapConversationDto(dto: ChatConversationDto, cachedMessages?: ChatMessage[], contextHint?: ChatContext): ChatConversation {
  return {
    id: dto.id,
    title: dto.title,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    context: mapContextDto(dto.context, contextHint),
    messages: cachedMessages ?? [],
  }
}

function extractConversationList(data: ChatConversationListDto): ChatConversationDto[] {
  if (Array.isArray(data)) return data
  if ('items' in data) return data.items
  if ('conversations' in data) return data.conversations
  return []
}

function extractSendResponse(data: SendChatMessageResponseDto): { userMsg?: ChatMessageDto; assistantMsg: ChatMessageDto } {
  if ('assistantMessage' in data) return { userMsg: data.userMessage, assistantMsg: data.assistantMessage }
  if ('messages' in data) {
    const msgs = data.messages
    const assistant = msgs.find((m) => m.role === 'assistant') ?? msgs[msgs.length - 1]
    const user = msgs.find((m) => m.role === 'user')
    return { userMsg: user, assistantMsg: assistant }
  }
  // Single message (most common — just the assistant reply)
  return { assistantMsg: data as ChatMessageDto }
}

// ---------------------------------------------------------------------------
// Message history loader (lazy, cached)
// ---------------------------------------------------------------------------

async function loadMessagesForConversation(id: string): Promise<ChatMessage[]> {
  if (messageCache.has(id)) return messageCache.get(id)!
  try {
    const response = await apiClient.get<ChatConversationDetailDto>(`/api/chat/conversations/${id}`)
    const messages = (response.data.messages ?? []).map(mapMessageDto)
    messageCache.set(id, messages)
    return messages
  } catch {
    messageCache.set(id, [])
    return []
  }
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

export const apiChatService: ChatService = {
  async listConversations(): Promise<ChatConversation[]> {
    const response = await apiClient.get<ChatConversationListDto>('/api/chat/conversations')
    const dtos = extractConversationList(response.data)

    // Lazy-load messages for conversations not yet in cache (parallel, capped to 10)
    const uncached = dtos.filter((dto) => !messageCache.has(dto.id)).slice(0, 10)
    if (uncached.length) {
      await Promise.allSettled(uncached.map((dto) => loadMessagesForConversation(dto.id)))
    }

    return dtos
      .map((dto) => mapConversationDto(dto, messageCache.get(dto.id)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  async createConversation(input: CreateConversationInput): Promise<ChatConversation> {
    const body: CreateConversationRequestDto = {
      title: input.title ?? null,
      context: {
        type: input.context.type,
        courseId: input.context.courseId ?? null,
        topicId: input.context.topicId ?? null,
      },
    }
    const response = await apiClient.post<ChatConversationDto>('/api/chat/conversations', body)
    const dto = response.data
    messageCache.set(dto.id, [])
    // Preserve display titles from input (backend may only echo IDs)
    return mapConversationDto(dto, [], input.context)
  },

  async renameConversation(id: string, title: string): Promise<ChatConversation> {
    const body: PatchConversationRequestDto = { title: title.trim() || 'Untitled conversation' }
    const response = await apiClient.patch<ChatConversationDto>(`/api/chat/conversations/${id}`, body)
    const cached = messageCache.get(id) ?? await loadMessagesForConversation(id)
    return mapConversationDto(response.data, cached)
  },

  async updateContext(id: string, context: ChatContext): Promise<ChatConversation> {
    const body: PatchConversationRequestDto = {
      context: {
        type: context.type,
        courseId: context.courseId ?? null,
        topicId: context.topicId ?? null,
      },
    }
    const response = await apiClient.patch<ChatConversationDto>(`/api/chat/conversations/${id}`, body)
    const cached = messageCache.get(id) ?? await loadMessagesForConversation(id)
    // Inject display titles from the caller since the backend only returns IDs
    return mapConversationDto(response.data, cached, context)
  },

  async deleteConversation(id: string): Promise<void> {
    await apiClient.delete(`/api/chat/conversations/${id}`)
    messageCache.delete(id)
  },

  async sendMessage(id: string, content: string): Promise<ChatMessage> {
    checkRateLimit()

    const body: SendChatMessageRequestDto = { content: content.trim() }

    let responseData: SendChatMessageResponseDto
    try {
      const response = await apiClient.post<SendChatMessageResponseDto>(
        `/api/chat/conversations/${id}/messages`,
        body,
      )
      responseData = response.data
    } catch (error) {
      if (error instanceof ApiError && error.code === 'rate-limited') {
        handleRateLimitResponse(error)
      }
      throw error
    }

    const { userMsg, assistantMsg } = extractSendResponse(responseData)

    // Build the user message — prefer the server echo, fall back to local copy
    const userChatMessage: ChatMessage = userMsg
      ? mapMessageDto(userMsg)
      : { id: `local-user-${Date.now()}`, role: 'user', content: content.trim(), createdAt: new Date().toISOString() }

    const assistantChatMessage = mapMessageDto(assistantMsg)

    // Update message cache: append user + assistant messages
    const existing = messageCache.get(id) ?? []
    // Avoid duplicate if the user message was already added optimistically
    const hasUser = existing.some((m) => m.id === userChatMessage.id)
    messageCache.set(id, hasUser ? [...existing, assistantChatMessage] : [...existing, userChatMessage, assistantChatMessage])

    return assistantChatMessage
  },

  async streamMessage(id: string, content: string, handlers: ChatStreamHandlers, signal?: AbortSignal): Promise<ChatMessage> {
    checkRateLimit()
    const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ?? ''
    let response: Response
    try {
      response = await fetch(`${baseUrl}/api/chat/conversations/${id}/messages/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ content: content.trim() } satisfies SendChatMessageRequestDto),
        signal,
      })
    } catch (error) {
      if (signal?.aborted) throw new ApiError({ code: 'cancelled', message: 'The request was cancelled.' })
      throw new ApiError({ code: 'network-error', message: 'The server could not be reached.', details: error })
    }
    if (!response.ok || !response.body) {
      const error = await errorFromResponse(response)
      if (error.code === 'rate-limited') handleRateLimitResponse(error, response.headers.get('retry-after'))
      throw error
    }

    let userMessage: ChatMessage | undefined
    try {
      for await (const { event, data } of readSse(response.body)) {
        if (event === 'user') {
          userMessage = mapMessageDto(data as ChatMessageDto)
          handlers.onUserMessage?.(userMessage)
        } else if (event === 'meta') {
          handlers.onMeta?.(data as { knowledgeMode: 'course_grounded' | 'general_knowledge' })
        } else if (event === 'delta') {
          handlers.onDelta?.((data as { text: string }).text)
        } else if (event === 'done') {
          const assistant = mapMessageDto(data as ChatMessageDto)
          const existing = messageCache.get(id) ?? []
          messageCache.set(id, [...existing, ...(userMessage ? [userMessage] : []), assistant])
          return assistant
        } else if (event === 'error') {
          const payload = data as { message?: string }
          throw new ApiError({ code: 'service-unavailable', status: 503, message: payload.message ?? 'The assistant could not respond.' })
        }
      }
    } catch (error) {
      // The server may have kept the question and a partial answer: reload this conversation next time.
      messageCache.delete(id)
      if (error instanceof ApiError) throw error
      if (signal?.aborted) throw new ApiError({ code: 'cancelled', message: 'The answer was stopped.' })
      throw new ApiError({ code: 'network-error', message: 'The connection was interrupted.', details: error })
    }
    messageCache.delete(id)
    throw new ApiError({ code: 'network-error', message: 'The connection closed before the answer finished.' })
  },
}

// Export for testing and direct imports
export { messageCache as chatMessageCache }
