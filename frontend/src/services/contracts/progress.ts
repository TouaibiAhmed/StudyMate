export type ConceptStatus = 'Needs practice' | 'Developing' | 'Good evidence' | 'Not enough evidence'

export type ProgressAttempt = {
  id: string
  date: string
  verdict: 'Correct' | 'Partially correct' | 'Needs review'
  answer: string
  evidence: string
  confidence: 'High' | 'Medium' | 'Low'
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
  practiceSessionId?: string
  recommendedAction: string
  attempts: ProgressAttempt[]
}

export type ProgressSession = {
  id: string
  title: string
  course: string
  date: string
  duration: string
  outcome: string
  verdict: 'Correct' | 'Partially correct' | 'Needs review'
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
}

export interface ProgressService {
  getProgress(): Promise<ProgressData>
}
