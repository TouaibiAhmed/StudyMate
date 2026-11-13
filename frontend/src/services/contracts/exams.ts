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
  /** Present in api mode: the attempt id used for save/submit calls */
  attemptId?: string
  /** Present in api mode: ISO timestamp of the server-authoritative deadline */
  deadlineAt?: string
}

/** Progress of background work (question writing before the exam, grading after it). */
export type ExamProgress = { progress: number; stage?: string }

export interface ExamService {
  getOptions(): Promise<ExamCourseOption[]>
  listAttempts(): Promise<ExamAttempt[]>
  /** api mode: waits until the questions are written, then starts the timer. */
  createExam(setup: ExamSetup, onProgress?: (progress: ExamProgress) => void): Promise<PracticeExam>
  getExam(id: string): Promise<PracticeExam | undefined>
  /** api mode: waits while the submitted answers are being graded. */
  getResult(id: string, onProgress?: (progress: ExamProgress) => void): Promise<ExamResult | undefined>
  /** Optional: save a single answer to the server */
  saveAnswer?(attemptId: string, questionId: string, answer: string, flagged: boolean): Promise<void>
  /** Optional: submit the attempt to the server; rejects with code 'conflict' if already submitted */
  submitAttempt?(attemptId: string): Promise<void>
}
