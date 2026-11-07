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
  ExamQuestion,
  ExamQuestionResult,
  ExamResult,
  ExamService,
  ExamVerdict,
  PracticeExam,
} from '../contracts/exams'
import { ApiError } from '../http-client'
import { apiClient } from '../http-client'

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
    concept: q.conceptId ?? '',
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

function mapAttemptDtoToAttempt(dto: ExamAttemptDto): ExamAttempt {
  return mapAttemptSummaryToAttempt(dto as ExamAttemptSummaryDto)
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

  async createExam(setup): Promise<PracticeExam> {
    const createBody: ExamCreateRequestDto = {
      courseId: setup.courseId,
      topicIds: setup.topicIds,
      questionCount: setup.questionCount,
      timeLimitSeconds: setup.timeLimit * 60,
    }
    const examResponse = await apiClient.post<ExamDto>('/api/exams', createBody)
    const examDto = examResponse.data

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

  async getResult(id: string): Promise<ExamResult | undefined> {
    // id is the attempt id
    let analysisDto: ExamAnalysisDto
    try {
      const r = await apiClient.get<ExamAnalysisDto>(`/api/exam-attempts/${id}/analysis`)
      analysisDto = r.data
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
