import type { ApiId, ApiPage, ApiSourceReference, IsoTimestamp } from './common'

export type EvidenceVerdict = 'correct' | 'partially_correct' | 'incorrect' | 'insufficient_evidence' | 'needs_review'
export type EvidenceConfidence = 'high' | 'medium' | 'low'
export type ConceptStatus = 'needs_practice' | 'developing' | 'good_evidence' | 'not_enough_evidence'

export type ConceptEvidenceDto = {
  id: ApiId
  userId?: ApiId
  conceptId: ApiId
  concept_id?: ApiId
  sessionId?: ApiId | null
  session_id?: ApiId | null
  answer: string
  verdict: EvidenceVerdict | string
  confidence: EvidenceConfidence | string
  strengths?: string[]
  gaps?: string[]
  missingIdeas?: string[]
  missing_ideas?: string[]
  sources?: ApiSourceReference[]
  createdAt?: IsoTimestamp
  created_at?: IsoTimestamp
}

export type ConceptProgressDto = {
  id?: ApiId
  conceptId?: ApiId
  concept_id?: ApiId
  courseId?: ApiId
  course_id?: ApiId
  name?: string
  title?: string
  status: ConceptStatus | string
  progress?: number
  evidenceCount?: number
  evidence_count?: number
  evidenceSummary?: string
  evidence_summary?: string
  latestEvidence?: ConceptEvidenceDto | null
  latest_evidence?: ConceptEvidenceDto | null
  recommendedAction?: string | null
  recommended_action?: string | null
  reason?: string | null
  attempts?: ConceptEvidenceDto[]
}

export type CourseProgressResponseDto = {
  courseId: ApiId
  course_id?: ApiId
  concepts: ConceptProgressDto[]
  summary?: {
    totalConcepts?: number
    mastered?: number
    needsPractice?: number
  }
}

export type StudyHistoryItemDto = {
  id: ApiId
  sessionId?: ApiId
  session_id?: ApiId
  courseId?: ApiId | null
  course_id?: ApiId | null
  course?: string
  title: string
  durationSeconds?: number
  duration?: string
  outcome?: string
  verdict?: string
  completed: boolean
  completedAt?: IsoTimestamp | null
  date?: string
}

export type ProgressDto = {
  studyMinutes?: number
  study_minutes?: number
  sessionsCompleted?: number
  sessions_completed?: number
  questionsAnswered?: number
  questions_answered?: number
  concepts: ConceptProgressDto[]
  recentSessions?: ApiPage<StudyHistoryItemDto> | StudyHistoryItemDto[]
  recent_sessions?: ApiPage<StudyHistoryItemDto> | StudyHistoryItemDto[]
  weeklyActivity?: Array<{ day: string; sessions: number; questions: number; minutes: number }>
  weekly_activity?: Array<{ day: string; sessions: number; questions: number; minutes: number }>
}
