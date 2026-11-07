export type ConceptStatus = 'Needs practice' | 'Developing' | 'Good evidence' | 'Not enough evidence'

export type ProgressAttempt = {
  id: string
  date: string
  verdict: 'Correct' | 'Partially correct' | 'Needs review' | 'Incorrect' | 'Insufficient evidence'
  answer: string
  evidence: string
  confidence: 'High' | 'Medium' | 'Low'
  sources?: string[]
}

export type RevisionTask = {
  id?: string
  conceptId: string
  reason: string
  dueAt?: string
  status?: string
}

export type ProgressConcept = {
  id: string
  name: string
  course: string
  courseId: string
  status: ConceptStatus
  evidence: string
  progress: number
  reason?: string
  revisionReason?: string
  practiceSessionId?: string
  recommendedAction: string
  attempts: ProgressAttempt[]
  domainType?: string
}

export type ProgressSession = {
  id: string
  title: string
  course: string
  courseId?: string
  date: string
  duration: string
  outcome: string
  verdict: 'Correct' | 'Partially correct' | 'Needs review' | 'Incorrect' | 'Insufficient evidence'
  completed: boolean
}

export type WeeklyProgress = {
  day: string
  sessions: number
  questions: number
  minutes: number
}

export type ProgressData = {
  studyMinutes: number
  sessionsCompleted: number
  questionsAnswered: number
  concepts: ProgressConcept[]
  recentSessions: ProgressSession[]
  weeklyActivity: WeeklyProgress[]
  courses?: Array<{ id: string; title: string }>
}

export interface ProgressService {
  getProgress(options?: { range?: '7d' | '30d' | 'all'; courseId?: string }): Promise<ProgressData>
  getCourseProgress?(courseId: string): Promise<ProgressConcept[]>
}
