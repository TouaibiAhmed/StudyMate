export type ChatContextType = 'general' | 'course' | 'topic'

export type ChatContext = {
  type: ChatContextType
  courseId?: string
  courseTitle?: string
  topicId?: string
  topicTitle?: string
}

export type ChatSource = {
  title: string
  page?: number
  excerpt?: string
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  /** Source references returned by the backend for grounded responses */
  sources?: ChatSource[]
  /** Whether the answer is based on the student's course material (api mode). */
  knowledgeMode?: 'course_grounded' | 'general_knowledge'
  /** 'interrupted' when the answer was stopped before it finished. */
  status?: 'complete' | 'interrupted'
}

export type ChatStreamHandlers = {
  /** The stored student message (sent first). */
  onUserMessage?(message: ChatMessage): void
  onMeta?(meta: { knowledgeMode: 'course_grounded' | 'general_knowledge' }): void
  /** Raw text as it is generated; citation markers are cleaned in the final message. */
  onDelta?(text: string): void
}

export type ChatConversation = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  context: ChatContext
  messages: ChatMessage[]
}

export type CreateConversationInput = {
  title?: string
  context: ChatContext
}

export interface ChatService {
  listConversations(): Promise<ChatConversation[]>
  createConversation(input: CreateConversationInput): Promise<ChatConversation>
  updateContext(id: string, context: ChatContext): Promise<ChatConversation>
  renameConversation(id: string, title: string): Promise<ChatConversation>
  deleteConversation(id: string): Promise<void>
  sendMessage(id: string, content: string): Promise<ChatMessage>
  /** Streams the answer token by token (api mode). Resolves with the final assistant message. */
  streamMessage?(id: string, content: string, handlers: ChatStreamHandlers, signal?: AbortSignal): Promise<ChatMessage>
}
