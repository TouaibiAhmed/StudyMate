import type { AnswerUsage, MockVerdict, NextActivityResult, SessionSource, StudyFeedback, StudyMode, StudyQuestion, StudySessionDetail, StudySessionService } from '../contracts/sessions'
import type { CreateSessionRequestDto, NextActivityResponseDto, StructuredEvaluationDto, StudyActivityDto, StudySessionDto } from '../contracts/api/study-sessions'
import type { ApiSourceReference } from '../contracts/api/common'
import { apiClient } from '../http-client'

function normalizeVerdict(verdict?: string): MockVerdict {
  if (!verdict) return 'Insufficient evidence'
  const v = verdict.toLowerCase()
  if (v === 'correct') return 'Correct'
  if (v === 'partially_correct' || v === 'partially correct') return 'Partially correct'
  if (v === 'incorrect') return 'Incorrect'
  return 'Insufficient evidence'
}

function normalizeConfidence(confidence?: string): StudyFeedback['confidence'] {
  if (!confidence) return 'Medium'
  const c = confidence.toLowerCase()
  if (c === 'high') return 'High'
  if (c === 'low') return 'Low'
  return 'Medium'
}

function mapSourceReference(ref: ApiSourceReference): SessionSource {
  const pageNum = typeof ref.page === 'number' ? ref.page : 1
  return {
    title: ref.title || 'Course Material',
    page: pageNum,
    excerpt: ref.excerpt || '',
  }
}

function mapSources(sources: ApiSourceReference[] | null | undefined, isGrounded: boolean): SessionSource[] {
  // According to Section 10.5 of v1.1 doc:
  // Never display a citation in general-knowledge mode.
  if (!isGrounded || !sources) return []
  return sources.map(mapSourceReference)
}

function mapActivityToQuestion(act: StudyActivityDto, defaultTopic: string, isGrounded: boolean): StudyQuestion {
  const sources = mapSources(act.sources || act.source_refs, isGrounded)
  return {
    id: act.id,
    topic: act.topic || defaultTopic,
    prompt: act.prompt || act.question || 'Explain your reasoning in your own words.',
    context: act.context ?? undefined,
    hints: Array.isArray(act.hints) ? act.hints : [],
    explanation: act.explanation || '',
    sources,
    type: act.type ?? undefined,
    difficulty: (act as { difficulty?: string }).difficulty,
    reason: (act as { reason?: string }).reason,
  }
}

/** Evaluation runs a local model synchronously: allow several minutes on CPU-only machines. */
const EVALUATION_TIMEOUT_MS = 300_000

export function mapSessionDtoToDetail(dto: StudySessionDto): StudySessionDetail {
  const rawMode = dto.mode || dto.knowledgeMode || dto.knowledge_mode || 'course_grounded'
  const isGrounded = rawMode.toLowerCase().includes('course')
  const mode: StudyMode = isGrounded ? 'Course-grounded' : 'General knowledge'

  const rawActivities = dto.activities || dto.questions || []
  // No placeholder question: while the backend is still writing the first activity the session
  // is 'preparing' and the page shows that state instead.
  const questions: StudyQuestion[] = rawActivities.map((act) => mapActivityToQuestion(act, dto.topic, isGrounded))

  const firstQuestion = questions[0]
  const sources = firstQuestion ? firstQuestion.sources : []

  return {
    id: dto.id,
    course: dto.courseTitle || dto.course_title || 'Course Study',
    courseId: dto.courseId || dto.course_id || undefined,
    topic: dto.topic,
    goal: dto.goal || `Demonstrate clear understanding of ${dto.topic}.`,
    mode,
    activityNumber: dto.activityNumber || dto.activity_number || 1,
    activityTotal: dto.activityTotal || dto.activity_total || questions.length,
    prompt: firstQuestion?.prompt || 'Work through this question carefully.',
    context: firstQuestion?.context,
    hints: firstQuestion?.hints || [],
    explanation: firstQuestion?.explanation || '',
    sources,
    questions,
    status: (dto.status as StudySessionDetail['status']) ?? undefined,
  }
}

export const apiStudySessionService: StudySessionService = {
  async startSession(input: {
    courseId?: string
    conceptId?: string
    topic?: string
    goal?: string
    mode?: StudyMode
  }): Promise<StudySessionDetail> {
    // The backend decides the knowledge mode from the material it finds (labelled in the session).
    const payload: CreateSessionRequestDto = {
      courseId: input.courseId,
      conceptId: input.conceptId,
      topic: input.topic,
      goal: input.goal,
    }
    const response = await apiClient.post<StudySessionDto>('/api/sessions', payload)
    return mapSessionDtoToDetail(response.data)
  },

  async getSession(sessionId: string): Promise<StudySessionDetail | undefined> {
    const response = await apiClient.get<StudySessionDto>(`/api/sessions/${sessionId}`)
    if (!response.data) return undefined
    return mapSessionDtoToDetail(response.data)
  },

  async getNextActivity(sessionId: string): Promise<NextActivityResult> {
    const response = await apiClient.post<NextActivityResponseDto & { status?: NextActivityResult['status'] }>(`/api/sessions/${sessionId}/next`)
    const data = response.data
    const status = data.status ?? (data.activity ? 'ready' : 'preparing')
    const grounded = (data.activity as { knowledgeMode?: string } | undefined)?.knowledgeMode !== 'general_knowledge'
    return {
      status,
      question: data.activity ? mapActivityToQuestion(data.activity, data.activity.topic ?? '', grounded) : undefined,
      reason: data.recommendedReason ?? data.recommended_reason,
      isLast: data.isLast ?? data.is_last,
    }
  },

  async evaluateAnswer(_sessionId: string, questionId: string, attempt: number, answer = '', usage?: AnswerUsage): Promise<StudyFeedback> {
    const payload = {
      answer: answer.trim(),
      attemptNumber: attempt + 1,
      hintsUsed: usage?.hintsUsed ?? 0,
      explanationViewed: usage?.explanationViewed ?? false,
    }
    const response = await apiClient.post<StructuredEvaluationDto>(`/api/activities/${questionId}/attempts`, payload, { timeoutMs: EVALUATION_TIMEOUT_MS })
    const dto = response.data

    const missingIdeas = Array.isArray(dto.missingIdeas)
      ? dto.missingIdeas
      : Array.isArray(dto.missing_ideas)
      ? dto.missing_ideas
      : Array.isArray(dto.gaps)
      ? dto.gaps
      : []
    const evidence = (dto.evidence || dto.sources || []).map(mapSourceReference)

    return {
      verdict: normalizeVerdict(dto.verdict),
      strengths: Array.isArray(dto.strengths) ? dto.strengths : [],
      missingIdeas,
      misconception: dto.misconception ?? undefined,
      confidence: normalizeConfidence(dto.confidence),
      nextActivity: dto.nextActivity || dto.next_activity || '',
      evidence: evidence.length ? evidence : undefined,
    }
  },

  async completeSession(sessionId: string): Promise<void> {
    await apiClient.post(`/api/sessions/${sessionId}/complete`)
  },
}
