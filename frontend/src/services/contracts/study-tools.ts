export type StudyToolKind = 'summary' | 'quiz'
export type SummaryLength = 'Short' | 'Medium' | 'Detailed'
export type SummaryStructure = 'Key Concepts' | 'Definitions' | 'Important Points' | 'Chapter-by-Chapter'
export type QuizDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Mixed'
export type QuizQuestionType = 'Multiple Choice' | 'True/False' | 'Short Answer'

/** A source reference attached to a summary or quiz by the backend */
export type StudyToolSource = {
  title: string
  page?: number
  excerpt?: string
}

export type QuizAnswer = {
  value: string
  isCorrect?: boolean
}

export type QuizQuestion = {
  id: string
  prompt: string
  type: QuizQuestionType
  options?: string[]
  /** answer is populated in mock mode; absent until submitQuizAttempt() in api mode */
  answer: QuizAnswer
  topicId?: string
}

/** Server-graded result from submitQuizAttempt() */
export type QuizAttemptResult = {
  attemptId: string
  score: number
  correctCount: number
  incorrectCount: number
  unansweredCount: number
  answers: Array<{
    questionId: string
    givenAnswer: string
    correctAnswer: string
    explanation?: string
    isCorrect: boolean
  }>
}

export type Quiz = {
  id: string
  courseId: string
  title: string
  createdAt: string
  sourceDocumentIds: string[]
  topicIds: string[]
  sourceLabel: string
  questionCount: number
  difficulty: QuizDifficulty
  questionTypes: QuizQuestionType[]
  language: string
  /** true in mock mode; absent/false in api mode */
  isMock?: boolean
  questions: QuizQuestion[]
  sources?: StudyToolSource[]
}

export type QuizResult = {
  quizId: string
  answers: Record<string, QuizAnswer>
  score?: number
  completedAt?: string
}

export type Summary = {
  id: string
  courseId: string
  title: string
  createdAt: string
  sourceDocumentIds: string[]
  topicIds: string[]
  sourceLabel: string
  length: SummaryLength
  language: string
  structure: SummaryStructure
  /** true in mock mode; absent/false in api mode */
  isMock?: boolean
  sections: Array<{
    heading: string
    points: string[]
  }>
  sources?: StudyToolSource[]
}

export type StudyToolArtifact = {
  id: string
  courseId: string
  kind: StudyToolKind
  title: string
  createdAt: string
  sourceDocumentIds: string[]
  description: string
}

export interface StudyToolsService {
  listArtifacts(courseId: string): Promise<StudyToolArtifact[]>
  createArtifact(courseId: string, kind: StudyToolKind, sourceDocumentIds: string[]): Promise<StudyToolArtifact>
  listSummaries(courseId: string): Promise<Summary[]>
  generateSummary(courseId: string, options: Pick<Summary, 'sourceDocumentIds' | 'topicIds' | 'length' | 'language' | 'structure'>): Promise<Summary>
  updateSummary(summaryId: string, updates: { title?: string }): Promise<Summary | undefined>
  deleteSummary(summaryId: string): Promise<void>
  listQuizzes(courseId: string): Promise<Quiz[]>
  generateQuiz(courseId: string, options: Pick<Quiz, 'sourceDocumentIds' | 'topicIds' | 'questionCount' | 'difficulty' | 'questionTypes' | 'language'>): Promise<Quiz>
  updateQuiz(quizId: string, updates: { title?: string }): Promise<Quiz | undefined>
  deleteQuiz(quizId: string): Promise<void>
  /** Optional: creates a server-side attempt. Only present in api mode. */
  startQuizAttempt?(quizId: string): Promise<{ attemptId: string }>
  /** Optional: submits answers to the server and returns graded results. Only present in api mode. */
  submitQuizAttempt?(attemptId: string, answers: Record<string, string>): Promise<QuizAttemptResult>
}
