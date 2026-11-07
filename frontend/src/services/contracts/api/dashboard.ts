import type { ApiId, IsoTimestamp } from './common'
import type { ConceptProgressDto, StudyHistoryItemDto } from './progress'

export type DashboardCourseDto = {
  courseId: ApiId
  title: string
  progress: number
  nextSessionId?: ApiId | null
  lastActivityAt?: IsoTimestamp | null
  // Undocumented extension fields — may be absent
  category?: string | null
  subject?: string | null
  color?: string | null
  icon?: string | null
  lessonCount?: number | null
  totalLessons?: number | null
  completedLessons?: number | null
  nextLessonTitle?: string | null
  nextLesson?: string | null
  lastActivityText?: string | null
}

export type DashboardActivityDto = {
  id: ApiId
  type: 'study_session' | 'quiz' | 'exam' | 'document' | string
  title: string
  courseId?: ApiId | null
  occurredAt: IsoTimestamp
  durationSeconds?: number | null
  durationMinutes?: number | null
}

export type DashboardRoadmapDto = {
  id?: ApiId | null
  title: string
  description?: string | null
  progress: number
  modules?: number | null
  moduleCount?: number | null
  color?: string | null
}

export type DashboardWeeklyActivityDto = {
  day: string
  minutes: number
  sessions?: number | null
  questions?: number | null
}

export type DashboardDto = {
  greetingName: string
  courses: DashboardCourseDto[]
  conceptsToPractice: ConceptProgressDto[]
  recentSessions: StudyHistoryItemDto[]
  activity?: DashboardActivityDto[] | null
  // Undocumented extension fields — may be absent
  greetingFocus?: string | null
  greetingRecommendation?: string | null
  recommendation?: string | null
  streak?: number | null
  currentStreak?: number | null
  isFirstTime?: boolean | null
  roadmap?: DashboardRoadmapDto | null
  weeklyActivity?: DashboardWeeklyActivityDto[] | null
  weekly_activity?: DashboardWeeklyActivityDto[] | null
}

export type DashboardActivityListDto = DashboardActivityDto[] | { items: DashboardActivityDto[] }
