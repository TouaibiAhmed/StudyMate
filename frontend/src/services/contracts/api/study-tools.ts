import type { ApiId, ApiPage, ApiSourceReference, IsoTimestamp } from './common'
import type { QuizDifficulty, QuizQuestionType, SummaryLength, SummaryStructure } from '../study-tools'

/**
 * Proposed additions: Summaries and quizzes are not described by an available
 * Documentation v1.1 artifact. These DTOs separate delivery from answer keys.
 *
 * Missing endpoints (not in the proposed list, assumed to exist):
 *   PATCH /api/summaries/{id}      — rename (updateSummary)
 *   PATCH /api/quizzes/{id}        — rename (updateQuiz)
 *   GET   /api/summaries/{id}      — load single summary + poll generation status
 *   GET   /api/quizzes/{id}        — load single quiz + poll generation status
 *   GET   /api/courses/{id}/study-tools  — list artifacts (listArtifacts, undocumented)
 *   POST  /api/courses/{id}/study-tools  — create artifact (createArtifact, undocumented)
 */
export type SummaryStatus = 'queued' | 'processing' | 'ready' | 'failed'

export type SummaryDto = {
  id: ApiId
  courseId: ApiId
  title: string
  status: SummaryStatus
  length: SummaryLength
  language: string
  structure: SummaryStructure
  topicIds: ApiId[]
  sourceDocumentIds?: ApiId[] | null
  sources: ApiSourceReference[]
  sections: Array<{ heading: string; points: string[] }>
  error?: string | null
  createdAt: IsoTimestamp
  updatedAt: IsoTimestamp
}

export type GenerateSummaryRequestDto = {
  sourceDocumentIds: ApiId[]
  topicIds: ApiId[]
  length: SummaryLength
  language: string
  structure: SummaryStructure
}

/** PATCH /api/summaries/{id} — rename; endpoint not in proposed list */
export type PatchSummaryRequestDto = {
  title?: string | null
}

/** GET /api/courses/{id}/summaries — list response */
export type SummaryListDto = SummaryDto[] | ApiPage<SummaryDto> | { summaries: SummaryDto[] }

export type QuizStatus = 'draft' | 'queued' | 'processing' | 'ready' | 'archived' | 'failed'

export type QuizQuestionDto = {
  id: ApiId
  quizId: ApiId
  prompt: string
  type: QuizQuestionType
  options?: string[] | null
  topicId?: ApiId | null
  // answer fields intentionally absent — only returned post-submission via QuizResultDto
}

export type QuizDto = {
  id: ApiId
  courseId: ApiId
  title: string
  status: QuizStatus
  questionCount: number
  difficulty: QuizDifficulty
  questionTypes: QuizQuestionType[]
  language: string
  topicIds: ApiId[]
  sourceDocumentIds?: ApiId[] | null
  sources: ApiSourceReference[]
  questions: QuizQuestionDto[]
  error?: string | null
  createdAt: IsoTimestamp
  updatedAt: IsoTimestamp
}

export type GenerateQuizRequestDto = {
  sourceDocumentIds: ApiId[]
  topicIds: ApiId[]
  questionCount: number
  difficulty: QuizDifficulty
  questionTypes: QuizQuestionType[]
  language: string
}

/** PATCH /api/quizzes/{id} — rename; endpoint not in proposed list */
export type PatchQuizRequestDto = {
  title?: string | null
}

/** GET /api/courses/{id}/quizzes — list response */
export type QuizListDto = QuizDto[] | ApiPage<QuizDto> | { quizzes: QuizDto[] }

export type QuizAttemptStatus = 'in_progress' | 'submitted'

export type QuizAttemptDto = {
  id: ApiId
  quizId: ApiId
  status: QuizAttemptStatus
  startedAt: IsoTimestamp
  submittedAt?: IsoTimestamp | null
}

export type QuizAnswerDto = {
  questionId: ApiId
  answer: string
}

export type QuizResultDto = {
  attemptId: ApiId
  quizId: ApiId
  score?: number | null
  correctCount: number
  incorrectCount: number
  unansweredCount: number
  answers: Array<{
    questionId: ApiId
    answer?: string | null
    correctAnswer?: string | null
    explanation?: string | null
    isCorrect: boolean
  }>
  createdAt: IsoTimestamp
}

export type QuizAttemptListDto = ApiPage<QuizAttemptDto>

/** GET/POST /api/courses/{id}/study-tools — undocumented endpoint */
export type StudyToolArtifactDto = {
  id: ApiId
  courseId: ApiId
  kind: 'summary' | 'quiz'
  title: string
  createdAt: IsoTimestamp
  sourceDocumentIds?: ApiId[] | null
  description?: string | null
}

export type StudyToolArtifactListDto = StudyToolArtifactDto[] | ApiPage<StudyToolArtifactDto> | { artifacts: StudyToolArtifactDto[] }
