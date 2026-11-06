export type StudyToolKind = 'summary' | 'quiz'
export type SummaryLength = 'Short' | 'Medium' | 'Detailed'
export type SummaryStructure = 'Key Concepts' | 'Definitions' | 'Important Points' | 'Chapter-by-Chapter'
export type QuizDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Mixed'
export type QuizQuestionType = 'Multiple Choice' | 'True/False' | 'Short Answer'

export type QuizAnswer = {
  value: string
  isCorrect?: boolean
}

export type QuizQuestion = {
  id: string
  prompt: string
  type: QuizQuestionType
  options?: string[]
  answer: QuizAnswer
  topicId?: string
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
  isMock: true
  questions: QuizQuestion[]
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
  isMock: true
  sections: Array<{
    heading: string
    points: string[]
  }>
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
}
