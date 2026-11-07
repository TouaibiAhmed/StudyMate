import type { ApiId, ApiPage, IsoTimestamp } from './common'

export type ExamQuestionType = 'multiple_choice' | 'short_answer'

export type ExamQuestionDto = {
  id: ApiId
  examId: ApiId
  conceptId?: ApiId | null
  prompt: string
  type: ExamQuestionType
  options?: string[] | null
}

export type ExamDto = {
  id: ApiId
  courseId: ApiId
  title: string
  questionCount: number
  timeLimitSeconds: number
  topicIds: ApiId[]
  questions: ExamQuestionDto[]
  createdAt: IsoTimestamp
}

export type ExamAttemptStatus = 'in_progress' | 'submitted' | 'expired'

export type ExamAttemptDto = {
  id: ApiId
  examId: ApiId
  userId: ApiId
  status: ExamAttemptStatus
  startedAt: IsoTimestamp
  deadlineAt?: IsoTimestamp | null
  submittedAt?: IsoTimestamp | null
}

export type ExamAnswerDto = {
  questionId: ApiId
  answer: string
  flagged: boolean
}

export type ExamResultDto = {
  attemptId: ApiId
  completedQuestions: number
  totalQuestions: number
  timeUsedSeconds: number
  score?: number | null
  counts: {
    correct: number
    partiallyCorrect: number
    incorrect: number
    insufficientEvidence: number
  }
}

export type ExamAttemptListDto = ApiPage<ExamAttemptDto>

// --- Request bodies ---

export type ExamCreateRequestDto = {
  courseId: ApiId
  topicIds: ApiId[]
  questionCount: number
  timeLimitSeconds: number
}

export type ExamSaveAnswerRequestDto = {
  answer: string
  flagged: boolean
}

// --- Start response (includes server-authoritative deadline) ---

export type ExamAttemptStartResponseDto = {
  id: ApiId
  examId: ApiId
  userId: ApiId
  status: ExamAttemptStatus
  startedAt: IsoTimestamp
  deadlineAt: IsoTimestamp
  submittedAt?: IsoTimestamp | null
}

// --- Analysis (GET /api/exam-attempts/{id}/analysis) ---

export type ExamAnalysisQuestionDto = {
  questionId: ApiId
  prompt: string
  type: ExamQuestionType
  concept?: string | null
  options?: string[] | null
  answer: string
  verdict: string
  expectedIdeas: string[]
  strengths: string[]
  gaps: string[]
  confidence: string
}

export type ExamAnalysisConceptDto = {
  concept: string
  correct: number
  total: number
  summary: string
  nextAction: string
}

export type ExamAnalysisDto = {
  attemptId: ApiId
  examId: ApiId
  title: string
  course: string
  courseId: ApiId
  completedQuestions: number
  totalQuestions: number
  timeUsedSeconds: number
  scoreLabel?: string | null
  score?: number | null
  counts: {
    correct: number
    partiallyCorrect: number
    incorrect: number
    insufficientEvidence: number
  }
  questionResults: ExamAnalysisQuestionDto[]
  concepts: ExamAnalysisConceptDto[]
}

// --- Attempt summary for list views ---

export type ExamAttemptSummaryDto = ExamAttemptDto & {
  exam?: {
    title?: string | null
    course?: string | null
    courseId?: ApiId | null
    questionCount?: number | null
  } | null
  timeUsedSeconds?: number | null
  score?: number | null
  scoreLabel?: string | null
}
