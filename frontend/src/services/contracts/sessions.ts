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
  getNextActivity?(sessionId: string): Promise<StudyQuestion | undefined>
  evaluateAnswer(sessionId: string, questionId: string, attempt: number, answer?: string): Promise<StudyFeedback>
}
