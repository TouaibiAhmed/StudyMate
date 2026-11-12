import { BookOpen, Bot, Check, ChevronDown, Copy, Info, MessageCircle, Pencil, Plus, Send, Sparkles, Square, Trash2, UserRound, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { courseService, chatService } from '../services/api-client'
import type { CourseDetail, CourseSummary } from '../services/contracts/courses'
import type { ChatContext, ChatConversation, ChatMessage } from '../services/contracts/chat'
import { classifyAiError } from '../services/ai-error'

const suggestedPrompts = [
  'Explain this idea in a simple way',
  'Help me make a short revision plan',
  'What is the difference between these concepts?',
]

export function ChatPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeId, setActiveId] = useState('')
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [activeCourse, setActiveCourse] = useState<CourseDetail>()
  const [context, setContext] = useState<ChatContext>({ type: 'general' })
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState('')
  const [errorRetryable, setErrorRetryable] = useState(false)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [renameId, setRenameId] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [deleteId, setDeleteId] = useState('')
  const [copiedId, setCopiedId] = useState('')
  const [failedMessage, setFailedMessage] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const streamAbortRef = useRef<AbortController | null>(null)
  const [streaming, setStreaming] = useState(false)

  const activeConversation = conversations.find((conversation) => conversation.id === activeId)
  const topicOptions = activeCourse?.concepts ?? []

  useEffect(() => {
    let active = true
    void Promise.all([chatService.listConversations(), courseService.listCourses()]).then(([items, courseItems]) => {
      if (!active) return
      setConversations(items)
      setCourses(courseItems)
      const requested = searchParams.get('conversation')
      setActiveId(requested && items.some((item) => item.id === requested) ? requested : items[0]?.id ?? '')
      setLoading(false)
    }).catch(() => { if (active) { setError('Your conversations could not load. Try again; local chat data was not changed.'); setLoading(false) } })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const requested = searchParams.get('conversation')
    if (!loading && requested && conversations.some((conversation) => conversation.id === requested) && requested !== activeId) setActiveId(requested)
  }, [activeId, conversations, loading, searchParams])

  // Depend on ids only: the conversation object changes on every streamed token.
  const activeContextKey = activeConversation ? `${activeConversation.id}|${activeConversation.context.type}|${activeConversation.context.courseId ?? ''}|${activeConversation.context.topicId ?? ''}` : ''
  useEffect(() => {
    if (!activeConversation) return
    setContext(activeConversation.context)
    if (activeConversation.context.courseId) void courseService.getCourse(activeConversation.context.courseId).then(setActiveCourse)
    else setActiveCourse(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContextKey])

  const lastMessageLength = activeConversation?.messages[activeConversation.messages.length - 1]?.content.length ?? 0
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [activeConversation?.messages.length, typing, lastMessageLength])
  useEffect(() => () => streamAbortRef.current?.abort(), [])

  const contextLabel = useMemo(() => {
    if (!activeConversation) return 'General discussion'
    if (activeConversation.context.type === 'topic') return `${activeConversation.context.courseTitle} · ${activeConversation.context.topicTitle}`
    if (activeConversation.context.type === 'course') return activeConversation.context.courseTitle ?? 'Course discussion'
    return 'General discussion'
  }, [activeConversation])

  async function createConversation(nextContext: ChatContext = context) {
    const conversation = await chatService.createConversation({ context: nextContext })
    setConversations((current) => [conversation, ...current])
    setActiveId(conversation.id)
    setContext(nextContext)
    setMobileSidebar(false)
    navigate(`/chat?conversation=${conversation.id}`, { replace: true })
  }

  async function changeContext(nextContext: ChatContext) {
    setContext(nextContext)
    if (nextContext.courseId) {
      const detail = await courseService.getCourse(nextContext.courseId)
      setActiveCourse(detail)
    } else setActiveCourse(undefined)
    if (activeConversation) {
      if (activeConversation.messages.length) await createConversation(nextContext)
      else {
        const updated = await chatService.updateContext(activeConversation.id, nextContext)
        setConversations((current) => current.map((conversation) => conversation.id === updated.id ? updated : conversation))
      }
    }
  }

  function patchMessages(conversationId: string, update: (messages: ChatMessage[]) => ChatMessage[]) {
    setConversations((current) => current.map((conversation) => conversation.id === conversationId ? { ...conversation, messages: update(conversation.messages) } : conversation))
  }

  async function send(content = draft) {
    const message = content.trim()
    if (!message || typing) return
    let conversationId = activeConversation?.id
    if (!conversationId) {
      const created = await chatService.createConversation({ context })
      setConversations((current) => [created, ...current])
      setActiveId(created.id)
      navigate(`/chat?conversation=${created.id}`, { replace: true })
      conversationId = created.id
    }
    const targetId = conversationId
    setDraft('')
    setTyping(true)
    setError('')
    setErrorRetryable(false)
    setFailedMessage('')
    try {
      if (chatService.streamMessage) {
        const controller = new AbortController()
        streamAbortRef.current = controller
        const draftId = `streaming-${Date.now()}`
        let started = false
        const final = await chatService.streamMessage(targetId, message, {
          onUserMessage: (userMessage) => patchMessages(targetId, (messages) => [...messages, userMessage]),
          onDelta: (text) => {
            if (!started) {
              started = true
              setTyping(false)
              setStreaming(true)
              patchMessages(targetId, (messages) => [...messages, { id: draftId, role: 'assistant', content: text, createdAt: new Date().toISOString() }])
            } else {
              patchMessages(targetId, (messages) => messages.map((m) => m.id === draftId ? { ...m, content: m.content + text } : m))
            }
          },
        }, controller.signal)
        patchMessages(targetId, (messages) => [...messages.filter((m) => m.id !== draftId), final])
      } else {
        await chatService.sendMessage(targetId, message)
      }
      const updated = await chatService.listConversations()
      setConversations(updated)
    } catch (reason) {
      const info = classifyAiError(reason)
      if (info.code === 'cancelled') {
        // Stopped by the student: reload to show the partial answer the server kept.
        void chatService.listConversations().then(setConversations).catch(() => {})
      } else {
        setError(info.userMessage || 'The assistant could not respond. Try again.')
        setErrorRetryable(info.retryable)
        setFailedMessage(info.retryable ? message : '')
        void chatService.listConversations().then(setConversations).catch(() => {})
      }
    } finally {
      setTyping(false)
      setStreaming(false)
      streamAbortRef.current = null
    }
  }

  function stopAnswer() {
    streamAbortRef.current?.abort()
  }

  async function confirmDelete() {
    if (!deleteId) return
    await chatService.deleteConversation(deleteId)
    const remaining = conversations.filter((conversation) => conversation.id !== deleteId)
    setConversations(remaining)
    setDeleteId('')
    if (activeId === deleteId) {
      const next = remaining[0]
      if (next) setActiveId(next.id)
      else await createConversation({ type: 'general' })
    }
  }

  async function saveRename() {
    if (!renameId) return
    const updated = await chatService.renameConversation(renameId, renameValue)
    setConversations((current) => current.map((conversation) => conversation.id === updated.id ? updated : conversation))
    setRenameId('')
  }

  function retryMessage() {
    if (failedMessage) void send(failedMessage)
  }

  async function copyMessage(id: string, content: string) {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId(''), 1500)
    } catch { setError('We could not copy that message. Select the text and copy it manually.') }
  }

  if (loading) return <div className="chat-loading" role="status">Opening your AI studio…</div>
  if (error && !conversations.length) return <EmptyState title="Chat is unavailable" text={error} action={<button className="button button-secondary" onClick={() => window.location.reload()}>Try again</button>} />

  return <div className="chat-workspace">
    <aside className={`chat-sidebar ${mobileSidebar ? 'chat-sidebar-open' : ''}`}>
      <div className="chat-sidebar-heading"><div><span className="eyebrow">StudyMate</span><h2>AI Studio</h2></div><button className="icon-button chat-mobile-close" onClick={() => setMobileSidebar(false)} aria-label="Close conversation list"><X size={17} /></button></div>
      <button className="button chat-new-button" onClick={() => void createConversation()}><Plus size={16} /> New conversation</button>
      <div className="chat-history-label">Your conversations</div>
      <div className="chat-history" aria-label="Conversation history">
        {conversations.map((conversation) => <div className={`chat-history-item ${conversation.id === activeId ? 'active' : ''}`} key={conversation.id}>
          {renameId === conversation.id ? <input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveRename(); if (event.key === 'Escape') setRenameId('') }} onBlur={() => void saveRename()} aria-label="Conversation title" /> : <button onClick={() => { setActiveId(conversation.id); setMobileSidebar(false); navigate(`/chat?conversation=${conversation.id}`, { replace: true }) }}><strong>{conversation.title}</strong><span>{formatDate(conversation.updatedAt)}</span></button>}
          <div className="chat-history-actions"><button onClick={() => { setRenameId(conversation.id); setRenameValue(conversation.title) }} aria-label={`Rename ${conversation.title}`}><Pencil size={13} /></button><button onClick={() => setDeleteId(conversation.id)} aria-label={`Delete ${conversation.title}`}><Trash2 size={13} /></button></div>
        </div>)}
      </div>
      <div className="chat-sidebar-note"><Sparkles size={15} /><span>AI Studio · ask freely or ground a discussion in a course.</span></div>
    </aside>
    {mobileSidebar && <button className="chat-sidebar-overlay" onClick={() => setMobileSidebar(false)} aria-label="Close conversation list" />}
    <main className="chat-main">
      <header className="chat-header"><button className="chat-mobile-open" onClick={() => setMobileSidebar(true)} aria-label="Open conversation list"><MessageCircle size={19} /></button><div><span className="eyebrow">Free conversation</span><h1>{activeConversation?.title ?? 'AI Studio'}</h1></div><div className="chat-header-context"><Bot size={15} /><span>{contextLabel}</span></div></header>
      <section className="chat-context-bar" aria-label="Conversation context"><span>Discussing</span><select value={context.type} onChange={(event) => void changeContext({ type: event.target.value as ChatContext['type'], courseId: undefined, courseTitle: undefined, topicId: undefined, topicTitle: undefined })}><option value="general">General discussion</option><option value="course">A specific course</option><option value="topic">A topic or concept</option></select>{context.type !== 'general' && <select value={context.courseId ?? ''} onChange={(event) => { const course = courses.find((item) => item.id === event.target.value); void changeContext({ type: context.type, courseId: course?.id, courseTitle: course?.title }) }}><option value="">Choose a course</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}</select>}{context.type === 'topic' && <select value={context.topicId ?? ''} onChange={(event) => { const topic = topicOptions.find((item) => item.id === event.target.value); void changeContext({ ...context, topicId: topic?.id, topicTitle: topic?.title }) }} disabled={!context.courseId}><option value="">Choose a topic</option>{topicOptions.map((topic) => <option value={topic.id} key={topic.id}>{topic.title}</option>)}</select>}<span className={`chat-context-badge ${context.type === 'general' ? 'general' : 'grounded'}`}>{context.type === 'general' ? 'General knowledge' : 'Course-grounded'}</span></section>
      <section className="chat-messages" aria-live="polite">
        {!activeConversation?.messages.length && !typing && <div className="chat-empty"><div className="chat-empty-mark"><Bot size={25} /></div><h2>What would you like to explore?</h2><p>Ask freely, or choose a prompt to begin. This studio is separate from structured study sessions.</p><div className="chat-prompts">{suggestedPrompts.map((prompt) => <button key={prompt} onClick={() => void send(prompt)}>{prompt}<ChevronDown size={14} /></button>)}</div></div>}
        {activeConversation?.messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}><div className="chat-message-avatar">{message.role === 'assistant' ? <Bot size={16} /> : <UserRound size={16} />}</div><div className="chat-message-body"><div className="chat-message-meta"><strong>{message.role === 'assistant' ? 'StudyMate guide' : 'You'}</strong><span>{formatTime(message.createdAt)}</span></div><p>{message.content}</p>{message.role === 'assistant' && message.knowledgeMode === 'general_knowledge' && activeConversation.context.type !== 'general' && <p className="chat-knowledge-note"><Info size={12} /> General knowledge · not from your course material</p>}{message.status === 'interrupted' && <p className="chat-knowledge-note">Answer stopped before it finished.</p>}{message.role === 'assistant' && message.sources?.length ? <div className="chat-sources"><BookOpen size={12} />{message.sources.map((source, i) => <span key={i} className="chat-source-ref" title={source.excerpt ?? undefined}>{source.title}{source.page ? ` · p.${source.page}` : ''}</span>)}</div> : null}{message.role === 'assistant' && !message.id.startsWith('streaming-') && <button className="chat-copy" onClick={() => void copyMessage(message.id, message.content)}>{copiedId === message.id ? <Check size={13} /> : <Copy size={13} />} {copiedId === message.id ? 'Copied' : 'Copy'}</button>}</div></article>)}
        {typing && <div className="chat-message assistant"><div className="chat-message-avatar"><Bot size={16} /></div><div className="chat-typing" role="status" aria-label="Assistant is typing"><i /><i /><i /></div></div>}
        <div ref={endRef} />
      </section>
      {error && <div className="chat-error" role="alert"><p className="form-error">{error}</p>{errorRetryable && failedMessage && <button className="button button-secondary" onClick={retryMessage} disabled={typing}>Retry</button>}</div>}
      <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send() }}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} placeholder="Ask a question or explore an idea…" aria-label="Message StudyMate" rows={2} />{typing || streaming ? <button className="chat-send" type="button" onClick={stopAnswer} disabled={!chatService.streamMessage} aria-label="Stop the answer"><Square size={15} /></button> : <button className="chat-send" type="submit" disabled={!draft.trim()} aria-label="Send message"><Send size={17} /></button>}<small>{typing ? 'StudyMate is reading your material… answers from the local model can take a moment.' : 'Enter to send · Shift + Enter for a new line'}</small></form>
    </main>
    {deleteId && <div className="dialog-backdrop" role="presentation"><section className="dialog chat-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-chat-title"><span className="eyebrow">Conversation</span><h2 id="delete-chat-title">Delete this conversation?</h2><p>This permanently deletes the conversation and all its messages. It cannot be undone.</p><div className="dialog-actions"><button className="button button-ghost" onClick={() => setDeleteId('')}>Keep it</button><button className="button chat-danger" onClick={() => void confirmDelete()}>Delete conversation</button></div></section></div>}
  </div>
}

function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value)) }
function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) }
