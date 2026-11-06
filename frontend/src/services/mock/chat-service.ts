import type { ChatConversation, ChatMessage, ChatService, CreateConversationInput } from '../contracts/chat'

const storageKey = 'studymate:chat-conversations'
let nextNumber = 1
const failedPrompts = new Set<string>()

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}-${Date.now()}-${nextNumber++}`

const seedConversations: ChatConversation[] = [
  {
    id: 'chat-welcome',
    title: 'How should I revise backpropagation?',
    createdAt: '2026-11-02T09:00:00.000Z',
    updatedAt: '2026-11-02T09:04:00.000Z',
    context: { type: 'topic', courseId: 'deep-learning', courseTitle: 'Deep Learning', topicId: 'backpropagation', topicTitle: 'Backpropagation' },
    messages: [
      { id: 'message-welcome-1', role: 'user', content: 'How should I revise backpropagation?', createdAt: '2026-11-02T09:03:00.000Z' },
      { id: 'message-welcome-2', role: 'assistant', content: 'Start with the chain of events: a forward pass produces a prediction, the loss measures the error, and backpropagation sends gradients backward so each parameter can be updated. Try explaining why the chain rule is needed before looking at another worked example.', createdAt: '2026-11-02T09:04:00.000Z' },
    ],
  },
]

function read(): ChatConversation[] {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored ? JSON.parse(stored) as ChatConversation[] : seedConversations.map((conversation) => ({ ...conversation, messages: [...conversation.messages] }))
  } catch {
    return seedConversations.map((conversation) => ({ ...conversation, messages: [...conversation.messages] }))
  }
}

function write(conversations: ChatConversation[]) {
  localStorage.setItem(storageKey, JSON.stringify(conversations))
}

function responseFor(content: string, conversation: ChatConversation): string {
  const prompt = content.toLowerCase()
  if (prompt.includes('backprop')) return 'Think of backpropagation as credit assignment: it uses the chain rule to calculate how much each parameter contributed to the final loss. A useful next step is to trace one gradient through two layers.'
  if (prompt.includes('gradient') || prompt.includes('learning rate')) return 'A gradient describes how the loss changes as a parameter changes. Gradient descent uses that direction, with the learning rate controlling the size of each update. Compare a small and large learning rate to see the trade-off.'
  if (prompt.includes('study') || prompt.includes('revise')) return `For ${conversation.context.topicTitle ?? conversation.context.courseTitle ?? 'this topic'}, choose one idea to explain from memory, check the missing mechanism, then apply it to a small example. I can help you turn that into a short revision plan.`
  if (prompt.includes('hello') || prompt.includes('hi')) return 'Hello! I am your StudyMate companion. Ask me to unpack an idea, compare concepts, or help you plan a focused review.'
  if (conversation.context.type === 'general') return 'That is a useful question to explore. Start by stating the central idea in one sentence, then separate what you know from what you are still unsure about. I can help you examine either part.'
  return `Let’s keep this grounded in ${conversation.context.topicTitle ?? conversation.context.courseTitle ?? 'your selected context'}. Define the key idea, connect it to one example, and then test the connection with a counterexample.`
}

function findConversation(conversations: ChatConversation[], conversationId: string) {
  const conversation = conversations.find((item) => item.id === conversationId)
  if (!conversation) throw new Error('That conversation is no longer available.')
  return conversation
}

function generateTitle(content: string) {
  const words = content.trim().replace(/\s+/g, ' ').split(' ').slice(0, 7)
  const title = words.join(' ')
  return title.length > 48 ? `${title.slice(0, 45).trim()}…` : title
}

export const mockChatService: ChatService = {
  async listConversations() {
    return read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  async createConversation(input: CreateConversationInput) {
    const timestamp = now()
    const conversation: ChatConversation = {
      id: id('chat'),
      title: input.title?.trim() || 'New conversation',
      createdAt: timestamp,
      updatedAt: timestamp,
      context: input.context,
      messages: [],
    }
    const conversations = [conversation, ...read()]
    write(conversations)
    return conversation
  },
  async renameConversation(conversationId, title) {
    const conversations = read()
    const conversation = findConversation(conversations, conversationId)
    conversation.title = title.trim() || 'Untitled conversation'
    conversation.updatedAt = now()
    write(conversations)
    return conversation
  },
  async updateContext(conversationId, context) {
    const conversations = read()
    const conversation = findConversation(conversations, conversationId)
    conversation.context = context
    conversation.updatedAt = now()
    write(conversations)
    return conversation
  },
  async deleteConversation(conversationId) {
    write(read().filter((conversation) => conversation.id !== conversationId))
  },
  async sendMessage(conversationId, content) {
    const conversations = read()
    const conversation = findConversation(conversations, conversationId)
    const normalizedContent = content.trim().toLowerCase()
    if (normalizedContent.includes('simulate error') && !failedPrompts.has(`${conversationId}:${normalizedContent}`)) {
      failedPrompts.add(`${conversationId}:${normalizedContent}`)
      throw new Error('The mock assistant could not respond right now. Retry the message.')
    }
    const timestamp = now()
    conversation.messages.push({ id: id('message'), role: 'user', content: content.trim(), createdAt: timestamp })
    if (conversation.title === 'New conversation') conversation.title = generateTitle(content)
    const message: ChatMessage = { id: id('message'), role: 'assistant', content: responseFor(content, conversation), createdAt: now() }
    conversation.messages.push(message)
    conversation.updatedAt = message.createdAt
    write(conversations)
    return message
  },
}
