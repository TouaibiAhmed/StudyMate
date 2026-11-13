import type {
  ExamAnalysisDto,
  ExamAttemptDto,
  ExamAttemptStartResponseDto,
  ExamAttemptSummaryDto,
  ExamCreateRequestDto,
  ExamDto,
  ExamSaveAnswerRequestDto,
} from '../contracts/api/exams'
import type {
  ExamAttempt,
  ExamConceptResult,
  ExamCourseOption,
  ExamProgress,
  ExamQuestion,
  ExamQuestionResult,
  ExamResult,
  ExamService,
  ExamVerdict,
  PracticeExam,
} from '../contracts/exams'
import { ApiError } from '../http-client'
import { apiClient } from '../http-client'

type ExamGenerationState = { status?: string; progress?: number; stage?: string | null; error?: string | null }
type GradingState = { status?: 'grading' | 'graded' | 'failed'; progress?: number }

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function normalizeVerdict(raw: string): ExamVerdict {
  const v = raw.toLowerCase()
  if (v === 'correct') return 'Correct'
  if (v === 'partially_correct' || v === 'partially correct') return 'Partially correct'
  if (v === 'incorrect') return 'Incorrect'
  return 'Insufficient evidence'
}

function normalizeConfidence(raw: string): 'High' | 'Medium' | 'Low' {
  const c = raw.toLowerCase()
  if (c === 'high') return 'High'
  if (c === 'low') return 'Low'
  return 'Medium'
}

function mapQuestionType(type: string): ExamQuestion['type'] {
  return type === 'short_answer' ? 'short-answer' : 'multiple-choice'
}

function mapExamDto(dto: ExamDto): Omit<PracticeExam, 'attemptId' | 'deadlineAt'> {
  const topicTitles: string[] = []
  const questions: ExamQuestion[] = dto.questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    type: mapQuestionType(q.type),
    options: q.options ?? undefined,
    concept: q.concept ?? '',
  }))
  return {
    id: dto.id,
    courseId: dto.courseId,
    topicIds: dto.topicIds,
    questionCount: dto.questionCount,
    timeLimit: Math.round(dto.timeLimitSeconds / 60),
    title: dto.title,
    course: '',
    topicTitles,
    questions,
  }
}

function secondsToDisplay(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`
  const minutes = Math.round(seconds / 60)
  return `${minutes} min`
}

function formatAttemptDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function mapAttemptSummaryToAttempt(dto: ExamAttemptSummaryDto): ExamAttempt {
  const durationSeconds =
    dto.submittedAt && dto.startedAt
      ? Math.round((new Date(dto.submittedAt).getTime() - new Date(dto.startedAt).getTime()) / 1000)
      : dto.timeUsedSeconds ?? 0
  return {
    id: dto.id,
    title: dto.exam?.title ?? 'Practice exam',
    course: dto.exam?.course ?? '',
    date: formatAttemptDate(dto.startedAt),
    duration: secondsToDisplay(durationSeconds),
    questionCount: dto.exam?.questionCount ?? 0,
    result: dto.scoreLabel ?? (dto.score != null ? `${dto.score}%` : dto.status),
    score: dto.score ?? undefined,
    completed: dto.status === 'submitted',
  }
}

function mapAnalysisToResult(dto: ExamAnalysisDto): ExamResult {
  const questionResults: ExamQuestionResult[] = dto.questionResults.map((q) => ({
    question: {
      id: q.questionId,
      prompt: q.prompt,
      type: mapQuestionType(q.type),
      options: q.options ?? undefined,
      concept: q.concept ?? '',
    },
    answer: q.answer,
    verdict: normalizeVerdict(q.verdict),
    expectedIdeas: q.expectedIdeas,
    strengths: q.strengths,
    gaps: q.gaps,
    confidence: normalizeConfidence(q.confidence),
  }))

  const verdictCounts = questionResults.reduce(
    (acc, r) => { acc[r.verdict] = (acc[r.verdict] ?? 0) + 1; return acc },
    {} as Record<ExamVerdict, number>,
  )

  const concepts: ExamConceptResult[] = dto.concepts.map((c) => ({
    concept: c.concept,
    correct: c.correct,
    total: c.total,
    summary: c.summary,
    nextAction: c.nextAction,
  }))

  return {
    examId: dto.attemptId,
    title: dto.title,
    course: dto.course,
    courseId: dto.courseId,
    completedQuestions: dto.completedQuestions,
    totalQuestions: dto.totalQuestions,
    timeUsed: secondsToDisplay(dto.timeUsedSeconds),
    scoreLabel: dto.scoreLabel ?? (dto.score != null ? `Practice signal: ${dto.score}%` : 'Practice signal: not scored'),
    counts: {
      Correct: verdictCounts['Correct'] ?? dto.counts.correct,
      'Partially correct': verdictCounts['Partially correct'] ?? dto.counts.partiallyCorrect,
      Incorrect: verdictCounts['Incorrect'] ?? dto.counts.incorrect,
      'Insufficient evidence': verdictCounts['Insufficient evidence'] ?? dto.counts.insufficientEvidence,
    },
    questionResults,
    concepts,
  }
}

// ---------------------------------------------------------------------------
// Background work: questions are written before the clock starts, and answers are
// graded after submission. Both run on a local model and can take minutes.
// ---------------------------------------------------------------------------

const WAIT_MAX_MS = 30 * 60 * 1000

async function waitFor<T>(
  fetch: () => Promise<T>,
  done: (value: T) => boolean,
  failed: (value: T) => string | undefined,
  progress: (value: T) => ExamProgress,
  onProgress?: (progress: ExamProgress) => void,
): Promise<T> {
  const started = Date.now()
  for (let attempt = 0; Date.now() - started < WAIT_MAX_MS; attempt++) {
    if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, Math.min(1500 + attempt * 500, 5000)))
    const value = await fetch()
    onProgress?.(progress(value))
    const error = failed(value)
    if (error) throw new ApiError({ code: 'server-error', status: 500, message: error })
    if (done(value)) return value
  }
  throw new ApiError({ code: 'timeout', status: 408, message: 'This is taking too long. Try again in a moment.' })
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

export const apiExamService: ExamService = {
  async getOptions(): Promise<ExamCourseOption[]> {
    const response = await apiClient.get<ExamCourseOption[]>('/api/exams/options')
    return response.data
  },

  async listAttempts(): Promise<ExamAttempt[]> {
    const response = await apiClient.get<{ items: ExamAttemptSummaryDto[] } | ExamAttemptSummaryDto[]>('/api/exam-attempts')
    const items = Array.isArray(response.data) ? response.data : response.data.items
    return items.map(mapAttemptSummaryToAttempt)
  },

  async createExam(setup, onProgress): Promise<PracticeExam> {
    const createBody: ExamCreateRequestDto = {
      courseId: setup.courseId,
      topicIds: setup.topicIds,
      questionCount: setup.questionCount,
      timeLimitSeconds: setup.timeLimit * 60,
    }
    const created = (await apiClient.post<ExamDto & ExamGenerationState>('/api/exams', createBody)).data
    // The questions are written before the clock starts, so model latency never uses exam time.
    const examDto = await waitFor(
      async () => (await apiClient.get<ExamDto & ExamGenerationState>(`/api/exams/${created.id}`)).data,
      (dto) => dto.status === 'ready',
      (dto) => (dto.status === 'failed' ? dto.error || 'The exam could not be prepared.' : undefined),
      (dto) => ({ progress: dto.progress ?? 0, stage: dto.stage ?? undefined }),
      onProgress,
    )

    const startResponse = await apiClient.post<ExamAttemptStartResponseDto>(`/api/exams/${examDto.id}/start`)
    const attemptDto = startResponse.data

    const base = mapExamDto(examDto)
    return {
      ...base,
      id: attemptDto.id,
      attemptId: attemptDto.id,
      deadlineAt: attemptDto.deadlineAt,
    }
  },

  async getExam(id: string): Promise<PracticeExam | undefined> {
    // id is the attempt id in api mode (matches how createExam returns attemptId as id)
    let attemptDto: ExamAttemptDto
    try {
      const r = await apiClient.get<ExamAttemptDto>(`/api/exam-attempts/${id}`)
      attemptDto = r.data
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not-found') return undefined
      throw err
    }

    if (attemptDto.status === 'submitted') return undefined

    let examDto: ExamDto
    try {
      const r = await apiClient.get<ExamDto>(`/api/exams/${attemptDto.examId}`)
      examDto = r.data
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not-found') return undefined
      throw err
    }

    const base = mapExamDto(examDto)
    return {
      ...base,
      id: attemptDto.id,
      attemptId: attemptDto.id,
      deadlineAt: attemptDto.deadlineAt ?? undefined,
    }
  },

  async getResult(id: string, onProgress?: (progress: ExamProgress) => void): Promise<ExamResult | undefined> {
    // id is the attempt id; the analysis is ready once the worker has graded every answer.
    let analysisDto: ExamAnalysisDto
    try {
      analysisDto = await waitFor(
        async () => (await apiClient.get<ExamAnalysisDto & GradingState>(`/api/exam-attempts/${id}/analysis`)).data,
        (dto) => dto.status === undefined || dto.status === 'graded',
        (dto) => (dto.status === 'failed' ? 'Your answers could not be graded (the AI model was unavailable).' : undefined),
        (dto) => ({ progress: dto.progress ?? 0, stage: dto.status === 'graded' ? undefined : `Grading your answers… ${Math.round((dto.progress ?? 0) * 100)}%` }),
        onProgress,
      )
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not-found') return undefined
      throw err
    }
    return mapAnalysisToResult(analysisDto)
  },

  async saveAnswer(attemptId: string, questionId: string, answer: string, flagged: boolean): Promise<void> {
    const body: ExamSaveAnswerRequestDto = { answer, flagged }
    await apiClient.put(`/api/exam-attempts/${attemptId}/answers/${questionId}`, body)
  },

  async submitAttempt(attemptId: string): Promise<void> {
    try {
      await apiClient.post(`/api/exam-attempts/${attemptId}/submit`)
    } catch (err) {
      // 409 Conflict means already submitted — treat as success
      if (err instanceof ApiError && err.code === 'conflict') return
      throw err
    }
  },
}

// ---------------------------------------------------------------------------
// Legacy stub kept for callers that import from api-services directly
// (api-services.ts will re-export apiExamService from here)
// ---------------------------------------------------------------------------
export { apiExamService as default }
