import type { ApiId, ApiSourceReference, IsoTimestamp } from './common'

export type StudySessionMode = 'course_grounded' | 'general_knowledge'
export type StudyActivityType = 'question' | 'reflection' | 'review' | 'diagnostic' | 'practice'
export type StudySessionStatus = 'not_started' | 'in_progress' | 'completed' | 'abandoned'

export type CreateSessionRequestDto = {
  courseId?: string
  course_id?: string
  conceptId?: string
  concept_id?: string
  topic?: string
  goal?: string
  knowledgeMode?: StudySessionMode
  knowledge_mode?: StudySessionMode
}

export type StudyActivityDto = {
  id: ApiId
  sessionId?: ApiId
  session_id?: ApiId
  sequence?: number
  order?: number
  type?: StudyActivityType | string
  topic?: string
  prompt: string
  question?: string
  context?: string | null
  hints?: string[]
  explanation?: string | null
  sources?: ApiSourceReference[] | null
  source_refs?: ApiSourceReference[] | null
  scenarios?: StructuredEvaluationDto[]
}

export type StudySessionDto = {
  id: ApiId
  userId?: ApiId
  user_id?: ApiId
  courseId?: ApiId | null
  course_id?: ApiId | null
  conceptId?: ApiId | null
  concept_id?: ApiId | null
  courseTitle?: string
  course_title?: string
  title?: string
  topic: string
  goal: string
  mode?: StudySessionMode | string
  knowledgeMode?: StudySessionMode | string
  knowledge_mode?: StudySessionMode | string
  status: StudySessionStatus | string
  activityNumber?: number
  activity_number?: number
  activityTotal?: number
  activity_total?: number
  activities?: StudyActivityDto[]
  questions?: StudyActivityDto[]
  createdAt?: IsoTimestamp
  created_at?: IsoTimestamp
  startedAt?: IsoTimestamp | null
  completedAt?: IsoTimestamp | null
}

export type SubmitAttemptRequestDto = {
  answer: string
  attemptNumber?: number
  attempt_number?: number
}

export type StructuredEvaluationDto = {
  id?: ApiId
  activityId?: ApiId
  activity_id?: ApiId
  conceptId?: ApiId
  concept_id?: ApiId
  domainType?: string
  domain_type?: string
  verdict: 'correct' | 'partially_correct' | 'incorrect' | 'insufficient_evidence' | 'needs_review' | string
  rubricScore?: number
  rubric_score?: number
  strengths?: string[]
  gaps?: string[]
  missingIdeas?: string[]
  missing_ideas?: string[]
  misconception?: string | null
  nextActivity?: string
  next_activity?: string
  confidence?: 'high' | 'medium' | 'low' | string
  evidence?: ApiSourceReference[] | null
  sources?: ApiSourceReference[] | null
  explanation?: string | null
  createdAt?: IsoTimestamp
  created_at?: IsoTimestamp
}

export type NextActivityResponseDto = {
  activity: StudyActivityDto
  recommendedReason?: string
  recommended_reason?: string
  isLast?: boolean
  is_last?: boolean
}
