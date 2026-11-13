import type { DashboardContinue, DashboardData, DashboardNextStep, DashboardService, DashboardStreak } from '../contracts/dashboard'
import type { DashboardCourse, PracticeConcept, StudySession, WeeklyActivity } from '../../types'
import { apiClient } from '../http-client'

// Backend: GET /api/dashboard. Every number comes from stored data (study answers, quizzes, exams,
// chat), computed in the student's time zone.

type CourseDto = { courseId: string; title: string; subject: string; progress: number; conceptCount: number; lastActivityAt: string | null }
type PracticeDto = { conceptId: string; courseId: string; course: string; name: string; status: string; reason: string }
type HistoryDto = { id: string; sessionId: string; courseId: string | null; course: string | null; title: string; durationSeconds: number; outcome: string; completed: boolean; date: string }
type DayDto = { day: string; date: string; minutes: number; sessions: number; questions: number; active: boolean; isToday: boolean; isFuture: boolean }
type RoadmapDto = { id: string; title: string; progress: number; completedTopics: number; totalTopics: number; nextTopic: string | null }

type DashboardDto = {
  greetingName: string
  focus: string | null
  today: string
  partOfDay: 'morning' | 'afternoon' | 'evening'
  isFirstTime: boolean
  nextStep: DashboardNextStep
  continueLearning: DashboardContinue | null
  courses: CourseDto[]
  conceptsToPractice: PracticeDto[]
  recentSessions: HistoryDto[]
  week: DayDto[]
  weekMinutes: number
  streak: DashboardStreak
  weekGoal: { target: number; done: number }
  roadmap: RoadmapDto | null
  examSuggestion: { courseId: string; title: string; conceptCount: number } | null
}

const COLORS = ['purple', 'green', 'orange', 'blue'] as const

function colorFor(subject: string, index: number): string {
  const s = subject.toLowerCase()
  if (/deep|neural|learning|\bai\b/.test(s)) return 'purple'
  if (/stat|math|data|bio/.test(s)) return 'green'
  if (/business|econ|chem|phys|account|financ/.test(s)) return 'orange'
  return COLORS[index % COLORS.length]
}

function iconFor(subject: string): string {
  const s = subject.toLowerCase()
  if (/deep|neural|learning/.test(s)) return '∿'
  if (/stat|math/.test(s)) return 'σ'
  if (/bio/.test(s)) return '✣'
  if (/business|econ|account|financ/.test(s)) return '↗'
  return '＋'
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  if (days < 7) return `${date.toLocaleDateString(undefined, { weekday: 'long' })}, ${time}`
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function duration(seconds: number): string {
  if (seconds < 60) return seconds ? '<1 min' : '—'
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`.replace(' 0m', '')
}

export function minutesLabel(minutes: number): string {
  if (!minutes) return ''
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`.replace(' 0m', '')
}

function toCourse(dto: CourseDto, index: number): DashboardCourse {
  return {
    id: dto.courseId,
    title: dto.title,
    category: dto.subject,
    progress: dto.progress,
    lessons: dto.conceptCount,
    completed: 0,
    color: colorFor(dto.subject, index),
    icon: iconFor(dto.subject),
    lastActivity: dto.lastActivityAt ? `Last studied ${relativeTime(dto.lastActivityAt).replace(/^(Today|Yesterday)/, (w) => w.toLowerCase())}` : 'Not studied yet',
    nextLesson: '',
  }
}

function toConcept(dto: PracticeDto, index: number): PracticeConcept & { courseId: string; status: string } {
  return { id: dto.conceptId, title: dto.name, reason: dto.reason, course: dto.course, color: COLORS[index % 3], courseId: dto.courseId, status: dto.status }
}

function toSession(dto: HistoryDto): StudySession {
  const correct = dto.outcome.match(/(\d+) answers? · (\d+) correct/)
  return {
    id: dto.sessionId,
    title: dto.title,
    course: dto.course ?? 'General knowledge',
    duration: duration(dto.durationSeconds),
    completedAt: relativeTime(dto.date),
    score: correct && Number(correct[1]) > 0 ? `${correct[2]}/${correct[1]}` : undefined,
  }
}

function toDay(dto: DayDto): WeeklyActivity & { isToday: boolean; isFuture: boolean; active: boolean } {
  return { day: dto.day, minutes: dto.minutes, label: dto.isFuture ? '' : dto.minutes ? minutesLabel(dto.minutes) : dto.active ? '<1m' : 'Rest', isToday: dto.isToday, isFuture: dto.isFuture, active: dto.active }
}

// Kept for callers that refresh the dashboard after a learning action.
let dashboardVersion = 0
export function invalidateDashboard(): void { dashboardVersion++ }
export function getDashboardVersion(): number { return dashboardVersion }

export const apiDashboardService: DashboardService = {
  async getDashboard(): Promise<DashboardData> {
    const dto = (await apiClient.get<DashboardDto>('/api/dashboard')).data
    return {
      greeting: { name: dto.greetingName, focus: dto.focus ?? '', recommendation: dto.nextStep.title },
      courses: dto.courses.map(toCourse),
      concepts: dto.conceptsToPractice.map(toConcept),
      sessions: dto.recentSessions.map(toSession),
      weeklyActivity: dto.week.map(toDay),
      roadmap: dto.roadmap
        ? { ...dto.roadmap, description: '', modules: dto.roadmap.totalTopics, color: 'purple' }
        : null,
      isFirstTime: dto.isFirstTime,
      today: dto.today,
      partOfDay: dto.partOfDay,
      nextStep: dto.nextStep,
      continueLearning: dto.continueLearning,
      streak: dto.streak,
      weekGoal: dto.weekGoal,
      weekMinutes: dto.weekMinutes,
      examSuggestion: dto.examSuggestion,
    }
  },
}
