import type { DashboardCourse, PracticeConcept, Roadmap, StudySession, WeeklyActivity } from '../../types'

export type DashboardData = {
  greeting: { name: string; focus: string; recommendation: string }
  courses: DashboardCourse[]
  concepts: PracticeConcept[]
  sessions: StudySession[]
  weeklyActivity: WeeklyActivity[]
  roadmap: Roadmap
  isFirstTime: boolean
}

export interface DashboardService {
  getDashboard(): Promise<DashboardData>
}
