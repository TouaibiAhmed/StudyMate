export type StudyMode = 'Course-grounded' | 'General knowledge'

export type SessionSource = {
  title: string
  page: number
  excerpt: string
}

export type StudySessionDetail = {
  id: string
  course: string
  courseId?: string
  topic: string
  goal: string
  mode: StudyMode
  activityNumber: number
  activityTotal: number
  prompt: string
  context?: string
  hints: string[]
  explanation: string
  sources: SessionSource[]
  questions: StudyQuestion[]
  /** api mode: 'preparing' while the first question is being written by the local model. */
  status?: 'preparing' | 'active' | 'completed' | 'abandoned' | 'failed'
}

export type MockVerdict = 'Correct' | 'Partially correct' | 'Incorrect' | 'Insufficient evidence'

export type StudyFeedback = {
  verdict: MockVerdict
  strengths: string[]
  missingIdeas: string[]
  misconception?: string
  confidence: 'High' | 'Medium' | 'Low'
  nextActivity: string
  evidence?: SessionSource[]
}

export type StudyQuestion = {
  id: string
  topic: string
  prompt: string
  context?: string
  hints: string[]
  explanation: string
  sources: SessionSource[]
  scenarios?: StudyFeedback[]
  type?: string
  difficulty?: string
  /** Why this activity was chosen (from the learning policy). */
  reason?: string
}

export type NextActivityResult = {
  status: 'ready' | 'preparing' | 'complete' | 'failed'
  question?: StudyQuestion
  reason?: string
  isLast?: boolean
}

export type AnswerUsage = {
  hintsUsed: number
  explanationViewed: boolean
}

export type AnswerRecord = {
  questionId: string
  questionTopic: string
  answer: string
  feedback: StudyFeedback
}

export interface StudySessionService {
  startSession?(input: {
    courseId?: string
    conceptId?: string
    topic?: string
    goal?: string
    mode?: StudyMode
  }): Promise<StudySessionDetail>
  getSession(sessionId: string): Promise<StudySessionDetail | undefined>
  getNextActivity?(sessionId: string): Promise<NextActivityResult>
  evaluateAnswer(sessionId: string, questionId: string, attempt: number, answer?: string, usage?: AnswerUsage): Promise<StudyFeedback>
  completeSession?(sessionId: string): Promise<void>
}
