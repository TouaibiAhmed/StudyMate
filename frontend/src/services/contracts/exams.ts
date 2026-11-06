export type ExamTopic = {
  id: string
  title: string
}

export type ExamCourseOption = {
  id: string
  title: string
  concepts: ExamTopic[]
}

export type ExamSetup = {
  courseId: string
  topicIds: string[]
  questionCount: number
  timeLimit: number
}

export type ExamQuestion = {
  id: string
  prompt: string
  type: 'multiple-choice' | 'short-answer'
  options?: string[]
  concept: string
}

export type ExamVerdict = 'Correct' | 'Partially correct' | 'Incorrect' | 'Insufficient evidence'

export type ExamQuestionResult = {
  question: ExamQuestion
  answer: string
  verdict: ExamVerdict
  expectedIdeas: string[]
  strengths: string[]
  gaps: string[]
  confidence: 'High' | 'Medium' | 'Low'
}

export type ExamConceptResult = {
  concept: string
  correct: number
  total: number
  summary: string
  nextAction: string
}

export type ExamResult = {
  examId: string
  title: string
  course: string
  courseId: string
  completedQuestions: number
  totalQuestions: number
  timeUsed: string
  scoreLabel: string
  counts: Record<ExamVerdict, number>
  questionResults: ExamQuestionResult[]
  concepts: ExamConceptResult[]
}

export type ExamAttempt = {
  id: string
  title: string
  course: string
  date: string
  duration: string
  questionCount: number
  result: string
  score?: number
  completed: boolean
}

export type PracticeExam = ExamSetup & {
  id: string
  title: string
  course: string
  topicTitles: string[]
  questions: ExamQuestion[]
}

export interface ExamService {
  getOptions(): Promise<ExamCourseOption[]>
  listAttempts(): Promise<ExamAttempt[]>
  createExam(setup: ExamSetup): Promise<PracticeExam>
  getExam(id: string): Promise<PracticeExam | undefined>
  getResult(id: string): Promise<ExamResult | undefined>
}
