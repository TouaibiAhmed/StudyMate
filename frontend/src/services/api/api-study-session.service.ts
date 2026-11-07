import type { MockVerdict, SessionSource, StudyFeedback, StudyMode, StudyQuestion, StudySessionDetail, StudySessionService } from '../contracts/sessions'
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
  }
}

export function mapSessionDtoToDetail(dto: StudySessionDto): StudySessionDetail {
  const rawMode = dto.mode || dto.knowledgeMode || dto.knowledge_mode || 'course_grounded'
  const isGrounded = rawMode.toLowerCase().includes('course')
  const mode: StudyMode = isGrounded ? 'Course-grounded' : 'General knowledge'

  const rawActivities = dto.activities || dto.questions || []
  const questions: StudyQuestion[] = rawActivities.length
    ? rawActivities.map((act) => mapActivityToQuestion(act, dto.topic, isGrounded))
    : [
        {
          id: `act-${dto.id}-1`,
          topic: dto.topic,
          prompt: 'In your own words, explain the core idea of this topic.',
          hints: ['Focus on the primary mechanism and what changes.'],
          explanation: '',
          sources: [],
        },
      ]

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
    const isGrounded = input.mode ? input.mode === 'Course-grounded' : Boolean(input.courseId)
    const knowledgeMode = isGrounded ? 'course_grounded' : 'general_knowledge'

    const payload: CreateSessionRequestDto = {
      courseId: input.courseId,
      course_id: input.courseId,
      conceptId: input.conceptId,
      concept_id: input.conceptId,
      topic: input.topic || 'General study',
      goal: input.goal || `Deepen understanding of ${input.topic || 'the topic'}.`,
      knowledgeMode,
      knowledge_mode: knowledgeMode,
    }

    const response = await apiClient.post<StudySessionDto>('/api/sessions', payload)
    return mapSessionDtoToDetail(response.data)
  },

  async getSession(sessionId: string): Promise<StudySessionDetail | undefined> {
    const response = await apiClient.get<StudySessionDto>(`/api/sessions/${sessionId}`)
    if (!response.data) return undefined
    return mapSessionDtoToDetail(response.data)
  },

  async getNextActivity(sessionId: string): Promise<StudyQuestion | undefined> {
    const response = await apiClient.post<NextActivityResponseDto | StudyActivityDto>(`/api/sessions/${sessionId}/next`)
    if (!response.data) return undefined

    const activity = 'activity' in response.data ? response.data.activity : response.data
    return mapActivityToQuestion(activity, 'Follow-up practice', true)
  },

  async evaluateAnswer(sessionId: string, questionId: string, attempt: number, answer = ''): Promise<StudyFeedback> {
    const payload = {
      answer: answer.trim(),
      attemptNumber: attempt + 1,
      attempt_number: attempt + 1,
      sessionId,
      session_id: sessionId,
    }

    const response = await apiClient.post<StructuredEvaluationDto>(`/api/activities/${questionId}/attempts`, payload)
    const dto = response.data

    const verdict = normalizeVerdict(dto.verdict)
    const confidence = normalizeConfidence(dto.confidence)
    const strengths = Array.isArray(dto.strengths) ? dto.strengths : []
    const missingIdeas = Array.isArray(dto.missingIdeas)
      ? dto.missingIdeas
      : Array.isArray(dto.missing_ideas)
      ? dto.missing_ideas
      : Array.isArray(dto.gaps)
      ? dto.gaps
      : []

    const nextActivity = dto.nextActivity || dto.next_activity || 'Continue with the next concept practice.'
    const evidenceRefs = dto.evidence || dto.sources || []
    const evidence = evidenceRefs.map(mapSourceReference)

    return {
      verdict,
      strengths: strengths.length ? strengths : ['Clear initial attempt demonstrating reasoning effort.'],
      missingIdeas,
      misconception: dto.misconception ?? undefined,
      confidence,
      nextActivity,
      evidence: evidence.length ? evidence : undefined,
    }
  },
}
