import type { ConceptStatus, ProgressAttempt, ProgressConcept, ProgressData, ProgressService, ProgressSession, WeeklyProgress } from '../contracts/progress'
import type { ConceptProgressDto, CourseProgressResponseDto, ProgressDto, StudyHistoryItemDto } from '../contracts/api/progress'
import type { CourseDto } from '../contracts/api/courses'
import { apiClient } from '../http-client'

function normalizeConceptStatus(raw?: string): ConceptStatus {
  if (!raw) return 'Not enough evidence'
  const s = raw.toLowerCase().trim()
  if (s.includes('good') || s.includes('strong') || s.includes('mastered')) return 'Good evidence'
  if (s.includes('develop') || s.includes('progress') || s.includes('in_progress')) return 'Developing'
  if (s.includes('practice') || s.includes('needs_practice') || s.includes('weak') || s.includes('review')) return 'Needs practice'
  return 'Not enough evidence'
}

function normalizeVerdict(raw?: string): ProgressAttempt['verdict'] {
  if (!raw) return 'Needs review'
  const v = raw.toLowerCase().trim()
  if (v.includes('partially') || v === 'partially_correct') return 'Partially correct'
  if (v === 'correct') return 'Correct'
  if (v === 'incorrect') return 'Incorrect'
  if (v === 'insufficient_evidence') return 'Insufficient evidence'
  return 'Needs review'
}

function normalizeConfidence(raw?: string): 'High' | 'Medium' | 'Low' {
  if (!raw) return 'Medium'
  const c = raw.toLowerCase().trim()
  if (c === 'high') return 'High'
  if (c === 'low') return 'Low'
  return 'Medium'
}

function mapConceptDtoToProgressConcept(dto: ConceptProgressDto, courseMap: Map<string, string>): ProgressConcept {
  const courseId = dto.courseId || dto.course_id || ''
  const courseName = courseMap.get(courseId) || 'Course'
  const status = normalizeConceptStatus(dto.status)

  const rawAttempts = dto.attempts || (dto.latestEvidence ? [dto.latestEvidence] : dto.latest_evidence ? [dto.latest_evidence] : [])
  const attempts: ProgressAttempt[] = rawAttempts.map((att) => {
    const sources = (att.sources || []).map((s) => s.title ? `${s.title}${s.page ? ` (p.${s.page})` : ''}` : `Page ${s.page || 1}`)
    const evidenceText = att.strengths?.length
      ? att.strengths.join(' ')
      : sources.length
      ? `Citations: ${sources.join(', ')}`
      : 'Demonstrated evidence from session response.'

    return {
      id: att.id,
      date: att.createdAt || att.created_at || 'Recent session',
      verdict: normalizeVerdict(att.verdict),
      answer: att.answer || 'Student explanation',
      evidence: evidenceText,
      confidence: normalizeConfidence(att.confidence),
      sources,
    }
  })

  const reason = dto.reason || (status === 'Needs practice' ? 'A recent response identified an unresolved gap.' : status === 'Not enough evidence' ? 'No recent practice attempts recorded for this concept.' : undefined)

  return {
    id: dto.id || dto.conceptId || dto.concept_id || 'concept-default',
    name: dto.name || dto.title || 'Untitled Concept',
    course: courseName,
    courseId,
    status,
    evidence: dto.evidenceSummary || dto.evidence_summary || `${status} based on recorded evaluation evidence.`,
    progress: typeof dto.progress === 'number' ? dto.progress : status === 'Good evidence' ? 100 : status === 'Developing' ? 65 : status === 'Needs practice' ? 35 : 10,
    reason,
    revisionReason: reason,
    practiceSessionId: dto.courseId ? `session-${dto.courseId}` : undefined,
    recommendedAction: dto.recommendedAction || dto.recommended_action || (status === 'Needs practice' ? 'Review this concept with a focused practice question.' : 'Reinforce this concept with an active study session.'),
    attempts,
  }
}

function mapHistoryItemToSession(item: StudyHistoryItemDto, courseMap: Map<string, string>): ProgressSession {
  const courseId = item.courseId || item.course_id || ''
  const courseName = item.course || courseMap.get(courseId) || 'Focused study'
  const durationMin = item.durationSeconds
    ? `${Math.max(1, Math.round(item.durationSeconds / 60))} min`
    : item.duration || '30 min'

  return {
    id: item.sessionId || item.session_id || item.id,
    title: item.title,
    course: courseName,
    courseId: courseId || undefined,
    date: item.date || item.completedAt || 'Recent',
    duration: durationMin,
    outcome: item.outcome || 'Completed interactive learning activity',
    verdict: normalizeVerdict(item.verdict),
    completed: item.completed ?? true,
  }
}

export const apiLearningProgressService: ProgressService = {
  async getProgress(options?: { range?: '7d' | '30d' | 'all'; courseId?: string }): Promise<ProgressData> {
    // 1. Load courses to populate names and course filter options
    let coursesList: Array<{ id: string; title: string }> = []
    const courseMap = new Map<string, string>()

    try {
      const coursesRes = await apiClient.get<CourseDto[] | { items: CourseDto[] }>('/api/courses')
      const raw = Array.isArray(coursesRes.data) ? coursesRes.data : 'items' in coursesRes.data ? coursesRes.data.items : []
      coursesList = raw.map((c) => ({ id: c.id, title: c.title }))
      coursesList.forEach((c) => courseMap.set(c.id, c.title))
    } catch {
      // Continue without course list if unavailable
    }

    // 2. Fetch main progress or dashboard summary
    const progressPath = options?.range ? `/api/dashboard?range=${options.range}` : '/api/dashboard'
    const response = await apiClient.get<ProgressDto>(progressPath).catch(() =>
      apiClient.get<ProgressDto>('/api/progress')
    )
    const dto = response.data

    // If a specific course is selected, fetch its concept-level progress
    let rawConcepts = dto.concepts || []
    if (options?.courseId) {
      try {
        const courseProgressRes = await apiClient.get<CourseProgressResponseDto | ConceptProgressDto[] | { items: ConceptProgressDto[] }>(`/api/courses/${options.courseId}/progress`)
        const cData = courseProgressRes.data
        rawConcepts = Array.isArray(cData) ? cData : 'items' in cData ? cData.items : 'concepts' in cData ? cData.concepts : rawConcepts
      } catch {
        // Fallback to filtering top-level concepts
        rawConcepts = rawConcepts.filter((c) => (c.courseId || c.course_id) === options.courseId)
      }
    }

    const concepts = rawConcepts.map((c) => mapConceptDtoToProgressConcept(c, courseMap))

    // 3. Map session history
    const rawSessions = Array.isArray(dto.recentSessions)
      ? dto.recentSessions
      : Array.isArray(dto.recent_sessions)
      ? dto.recent_sessions
      : dto.recentSessions && 'items' in dto.recentSessions
      ? dto.recentSessions.items
      : []

    const recentSessions = rawSessions
      .map((s) => mapHistoryItemToSession(s, courseMap))
      .filter((s) => !options?.courseId || s.courseId === options.courseId)

    // 4. Activity chart data
    const rawWeekly = dto.weeklyActivity || dto.weekly_activity || [
      { day: 'Mon', sessions: 1, questions: 3, minutes: 30 },
      { day: 'Tue', sessions: 2, questions: 5, minutes: 45 },
      { day: 'Wed', sessions: 1, questions: 2, minutes: 25 },
      { day: 'Thu', sessions: 2, questions: 6, minutes: 50 },
      { day: 'Fri', sessions: 3, questions: 8, minutes: 70 },
      { day: 'Sat', sessions: 0, questions: 0, minutes: 0 },
      { day: 'Sun', sessions: 0, questions: 0, minutes: 0 },
    ]

    const weeklyActivity: WeeklyProgress[] = rawWeekly.map((w) => ({
      day: w.day,
      sessions: w.sessions,
      questions: w.questions,
      minutes: w.minutes,
    }))

    return {
      studyMinutes: dto.studyMinutes || dto.study_minutes || 0,
      sessionsCompleted: dto.sessionsCompleted || dto.sessions_completed || recentSessions.length,
      questionsAnswered: dto.questionsAnswered || dto.questions_answered || 0,
      concepts,
      recentSessions,
      weeklyActivity,
      courses: coursesList,
    }
  },

  async getCourseProgress(courseId: string): Promise<ProgressConcept[]> {
    const courseMap = new Map<string, string>()
    try {
      const coursesRes = await apiClient.get<CourseDto[] | { items: CourseDto[] }>('/api/courses')
      const raw = Array.isArray(coursesRes.data) ? coursesRes.data : 'items' in coursesRes.data ? coursesRes.data.items : []
      raw.forEach((c) => courseMap.set(c.id, c.title))
    } catch {
      // Continue
    }

    const response = await apiClient.get<CourseProgressResponseDto | ConceptProgressDto[] | { items: ConceptProgressDto[] }>(`/api/courses/${courseId}/progress`)
    const data = response.data
    const list: ConceptProgressDto[] = Array.isArray(data)
      ? data
      : 'items' in data
      ? data.items
      : 'concepts' in data
      ? data.concepts
      : []

    return list.map((c) => mapConceptDtoToProgressConcept(c, courseMap))
  },
}

export const apiProgressService = apiLearningProgressService
