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
import type { ChatContext, ChatConversation, ChatMessage, ChatService, ChatSource, CreateConversationInput } from '../contracts/chat'
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
}

// Export for testing and direct imports
export { messageCache as chatMessageCache }
