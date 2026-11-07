import type { ApiId, ApiPage, ApiSourceReference, IsoTimestamp } from './common'

export type ChatContextDto = {
  type: 'general' | 'course' | 'topic' | string
  courseId?: ApiId | null
  courseTitle?: string | null
  topicId?: ApiId | null
  topicTitle?: string | null
}

export type ChatConversationDto = {
  id: ApiId
  userId?: ApiId | null
  title: string
  context: ChatContextDto
  createdAt: IsoTimestamp
  updatedAt: IsoTimestamp
}

export type ChatMessageDto = {
  id: ApiId
  conversationId?: ApiId | null
  role: 'user' | 'assistant' | string
  content: string
  sources?: ApiSourceReference[] | null
  createdAt: IsoTimestamp
}

export type ChatMessagePageDto = ApiPage<ChatMessageDto>

/** GET /api/chat/conversations/{id} — includes full message history */
export type ChatConversationDetailDto = ChatConversationDto & {
  messages?: ChatMessageDto[] | null
  messageCount?: number | null
}

/** GET /api/chat/conversations — list response */
export type ChatConversationListDto =
  | ChatConversationDto[]
  | ApiPage<ChatConversationDto>
  | { conversations: ChatConversationDto[] }

/** POST /api/chat/conversations */
export type CreateConversationRequestDto = {
  title?: string | null
  context: {
    type: 'general' | 'course' | 'topic'
    courseId?: string | null
    topicId?: string | null
  }
}

/** POST /api/chat/conversations/{id}/messages */
export type SendChatMessageRequestDto = {
  content: string
}

/** POST response — may return just the assistant message or both messages */
export type SendChatMessageResponseDto =
  | ChatMessageDto
  | { userMessage: ChatMessageDto; assistantMessage: ChatMessageDto }
  | { messages: ChatMessageDto[] }

/** PATCH /api/chat/conversations/{id} */
export type PatchConversationRequestDto = {
  title?: string | null
  context?: {
    type: 'general' | 'course' | 'topic'
    courseId?: string | null
    topicId?: string | null
  } | null
}
