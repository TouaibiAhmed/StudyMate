import type { DashboardActivityDto, DashboardActivityListDto, DashboardCourseDto, DashboardDto } from '../contracts/api/dashboard'
import type { ConceptProgressDto, StudyHistoryItemDto } from '../contracts/api/progress'
import type { DashboardData, DashboardService } from '../contracts/dashboard'
import type { DashboardCourse, PracticeConcept, Roadmap, StudySession, WeeklyActivity } from '../../types'
import { apiClient } from '../http-client'

// ---------------------------------------------------------------------------
// Timezone-aware date formatting
// ---------------------------------------------------------------------------

const userTz = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

function relativeDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const tz = userTz()
    const date = new Date(iso)
    const nowMs = Date.now()
    const diffMs = nowMs - date.getTime()
    const diffDays = Math.floor(diffMs / 86_400_000)

    const timeStr = date.toLocaleTimeString(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' })

    if (diffDays === 0) return `Today, ${timeStr}`
    if (diffDays === 1) return `Yesterday, ${timeStr}`
    if (diffDays < 7) {
      const dayName = date.toLocaleDateString(undefined, { timeZone: tz, weekday: 'long' })
      return `${dayName}, ${timeStr}`
    }
    return date.toLocaleDateString(undefined, { timeZone: tz, dateStyle: 'medium' })
  } catch {
    return iso
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

// ---------------------------------------------------------------------------
// Color / icon helpers (mirror api-course.service.ts logic)
// ---------------------------------------------------------------------------

const COURSE_COLORS = ['purple', 'green', 'orange', 'blue'] as const
type CourseColor = typeof COURSE_COLORS[number]

function deriveColor(subject: string, index: number): CourseColor {
  const s = (subject ?? '').toLowerCase()
  if (s.includes('deep') || s.includes('neural') || s.includes('learning') || s.includes('ai')) return 'purple'
  if (s.includes('stat') || s.includes('math') || s.includes('data') || s.includes('bio')) return 'green'
  if (s.includes('business') || s.includes('econ') || s.includes('chem') || s.includes('phys')) return 'orange'
  return COURSE_COLORS[index % COURSE_COLORS.length]
}

function deriveIcon(subject: string): string {
  const s = (subject ?? '').toLowerCase()
  if (s.includes('deep') || s.includes('neural') || s.includes('learning')) return '∿'
  if (s.includes('stat') || s.includes('math')) return 'σ'
  if (s.includes('bio')) return '✣'
  if (s.includes('business')) return '↗'
  return '＋'
}

// ---------------------------------------------------------------------------
// DTO mappers
// ---------------------------------------------------------------------------

function mapCourseDto(dto: DashboardCourseDto, index: number): DashboardCourse {
  const subject = dto.category ?? dto.subject ?? dto.title
  const color = (dto.color as CourseColor | null) ?? deriveColor(subject, index)
  const icon = dto.icon ?? deriveIcon(subject)
  const totalLessons = dto.lessonCount ?? dto.totalLessons ?? 10
  const completed = dto.completedLessons ?? Math.round((dto.progress / 100) * totalLessons)

  const lastActivity = dto.lastActivityText ?? (dto.lastActivityAt ? `Last studied · ${relativeDate(dto.lastActivityAt)}` : 'Not started')
  const nextLesson = dto.nextLessonTitle ?? dto.nextLesson ?? 'Continue course'

  return {
    id: dto.courseId,
    title: dto.title,
    category: subject,
    progress: dto.progress,
    lessons: totalLessons,
    completed,
    color,
    icon,
    lastActivity,
    nextLesson,
  }
}

function mapConceptDto(dto: ConceptProgressDto, index: number): PracticeConcept {
  const CONCEPT_COLORS: CourseColor[] = ['purple', 'green', 'orange', 'purple', 'green']
  const conceptId = dto.id ?? dto.conceptId ?? dto.concept_id ?? `concept-${index}`
  const title = dto.title ?? dto.name ?? 'Concept'
  const reason = dto.reason ?? dto.recommendedAction ?? dto.recommended_action ?? 'Review this concept with a practice question.'
  const course = ''
  const color = CONCEPT_COLORS[index % CONCEPT_COLORS.length]
  return { id: conceptId, title, reason, course, color }
}

function mapSessionDto(dto: StudyHistoryItemDto): StudySession {
  const id = dto.sessionId ?? dto.session_id ?? dto.id
  const course = dto.course ?? ''
  const duration = dto.durationSeconds
    ? formatDuration(dto.durationSeconds)
    : (dto.duration ?? '30 min')
  const completedAt = dto.date ?? (dto.completedAt ? relativeDate(dto.completedAt) : 'Recent')
  const score = dto.outcome?.match(/\d+%/)?.[0] ?? undefined
  return { id, title: dto.title, course, duration, completedAt, score }
}

// ---------------------------------------------------------------------------
// Weekly activity aggregation from per-event feed
// ---------------------------------------------------------------------------

const DAY_ABBREVS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function aggregateActivityToWeekly(events: DashboardActivityDto[]): WeeklyActivity[] {
  const tz = userTz()
  const minutesByDay = new Array<number>(7).fill(0)
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay()) // Sunday
  weekStart.setHours(0, 0, 0, 0)

  for (const event of events) {
    try {
      const date = new Date(event.occurredAt)
      if (date < weekStart) continue
      const dayIndex = new Date(date.toLocaleString('en-US', { timeZone: tz })).getDay()
      const mins = event.durationMinutes ?? (event.durationSeconds != null ? Math.round(event.durationSeconds / 60) : 20)
      minutesByDay[dayIndex] += mins
    } catch {
      // Skip malformed timestamps
    }
  }

  return DAY_ABBREVS.map((day, i) => {
    const minutes = minutesByDay[i]
    const label = minutes === 0 ? 'Rest' : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`.replace(' 0m', '')
    return { day, minutes, label }
  })
}

function normalizeWeeklyActivity(raw: Array<{ day: string; minutes: number }>): WeeklyActivity[] {
  return raw.map(({ day, minutes }) => {
    const label = minutes === 0 ? 'Rest' : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`.replace(' 0m', '')
    return { day, minutes, label }
  })
}

// ---------------------------------------------------------------------------
// Cache invalidation signal — call after any learning action so the next
// getDashboard() call fetches fresh data (components that watch dashboardVersion
// can re-request; existing DashboardOverview re-fetches on each mount naturally)
// ---------------------------------------------------------------------------

let dashboardVersion = 0

export function invalidateDashboard(): void {
  dashboardVersion++
}

export function getDashboardVersion(): number {
  return dashboardVersion
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

export const apiDashboardService: DashboardService = {
  async getDashboard(): Promise<DashboardData> {
    // Fetch dashboard and activity in parallel; activity failure is non-fatal
    const [dashResponse, activityResponse] = await Promise.allSettled([
      apiClient.get<DashboardDto>('/api/dashboard'),
      apiClient.get<DashboardActivityListDto>('/api/dashboard/activity'),
    ])

    if (dashResponse.status === 'rejected') throw dashResponse.reason

    const dto = dashResponse.value.data
    const rawActivity = activityResponse.status === 'fulfilled'
      ? Array.isArray(activityResponse.value.data)
        ? activityResponse.value.data
        : 'items' in activityResponse.value.data
          ? activityResponse.value.data.items
          : []
      : (dto.activity ?? [])

    // Greeting
    const greetingName = dto.greetingName || 'there'
    const greetingFocus = dto.greetingFocus ?? ''
    const greetingRecommendation = dto.greetingRecommendation ?? dto.recommendation ?? ''

    // Courses
    const courses: DashboardCourse[] = (dto.courses ?? []).map((c, i) => mapCourseDto(c, i))

    // Concepts to practice
    const concepts: PracticeConcept[] = (dto.conceptsToPractice ?? []).map((c, i) => mapConceptDto(c, i))

    // Recent sessions
    const sessions: StudySession[] = (dto.recentSessions ?? []).map(mapSessionDto)

    // Weekly activity — prefer explicit aggregated data from API, fall back to computing from events
    let weeklyActivity: WeeklyActivity[]
    const rawWeekly = dto.weeklyActivity ?? dto.weekly_activity
    if (rawWeekly?.length) {
      weeklyActivity = normalizeWeeklyActivity(rawWeekly)
    } else if (rawActivity.length) {
      weeklyActivity = aggregateActivityToWeekly(rawActivity)
    } else {
      weeklyActivity = DAY_ABBREVS.map((day) => ({ day, minutes: 0, label: 'Rest' }))
    }

    // Roadmap
    const roadmap: Roadmap = dto.roadmap
      ? {
          title: dto.roadmap.title,
          description: dto.roadmap.description ?? '',
          progress: dto.roadmap.progress,
          modules: dto.roadmap.modules ?? dto.roadmap.moduleCount ?? 8,
          color: dto.roadmap.color ?? 'purple',
        }
      : { title: 'Learning Path', description: '', progress: 0, modules: 0, color: 'purple' }

    // isFirstTime: true if no courses AND no sessions AND no concepts
    const isFirstTime = dto.isFirstTime ?? (courses.length === 0 && sessions.length === 0 && concepts.length === 0)

    return {
      greeting: { name: greetingName, focus: greetingFocus, recommendation: greetingRecommendation },
      courses,
      concepts,
      sessions,
      weeklyActivity,
      roadmap,
      isFirstTime,
    }
  },
}
