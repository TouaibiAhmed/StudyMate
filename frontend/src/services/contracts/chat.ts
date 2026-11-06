export type ChatContextType = 'general' | 'course' | 'topic'

export type ChatContext = {
  type: ChatContextType
  courseId?: string
  courseTitle?: string
  topicId?: string
  topicTitle?: string
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
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
}
