import type { DashboardCourse, PracticeConcept, Roadmap, StudySession, WeeklyActivity } from '../../types'

/** The single most useful thing to do now (chosen by rules on the server). */
export type DashboardNextStep = {
  kind: 'upload' | 'wait_for_material' | 'resume_session' | 'study_concept' | 'practice_exam' | 'roadmap' | string
  title: string
  detail: string
  href?: string | null
  courseId?: string | null
  conceptId?: string | null
  sessionId?: string | null
}

export type DashboardContinue = {
  sessionId: string
  courseId: string | null
  course: string | null
  topic: string
  answered: number
  planned: number
  status: string
  lastActivityAt: string
}

export type DashboardStreak = { current: number; longest: number; activeToday: boolean; show: boolean }

export type DashboardRoadmap = Roadmap & {
  id?: string
  completedTopics?: number
  totalTopics?: number
  nextTopic?: string | null
}

export type DashboardData = {
  greeting: { name: string; focus: string; recommendation: string }
  courses: DashboardCourse[]
  concepts: PracticeConcept[]
  sessions: StudySession[]
  weeklyActivity: WeeklyActivity[]
  roadmap: DashboardRoadmap | null
  isFirstTime: boolean
  // Served by the API; optional so the mock can stay small.
  today?: string
  partOfDay?: 'morning' | 'afternoon' | 'evening'
  nextStep?: DashboardNextStep
  continueLearning?: DashboardContinue | null
  streak?: DashboardStreak
  weekGoal?: { target: number; done: number }
  weekMinutes?: number
  examSuggestion?: { courseId: string; title: string; conceptCount: number } | null
}

export interface DashboardService {
  getDashboard(): Promise<DashboardData>
}
