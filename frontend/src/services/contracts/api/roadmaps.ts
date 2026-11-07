import type { ApiId, ApiStatus, IsoTimestamp } from './common'

export type RoadmapCategory = 'data' | 'engineering' | 'machine_learning' | 'business' | string
export type RoadmapNodeType = 'core' | 'optional'
export type RoadmapNodeStatus = 'not_started' | 'in_progress' | 'completed' | 'known'

export type RoadmapNodeResourceDto = {
  title: string
  kind?: 'suggestion' | 'article' | 'course' | 'tutorial'
  url?: string
}

export type RoadmapNodeDto = {
  id: ApiId
  nodeId?: ApiId
  node_id?: ApiId
  roadmapId?: ApiId
  roadmap_id?: ApiId
  title: string
  description?: string
  order?: number
  type?: RoadmapNodeType | string
  optional?: boolean
  status?: RoadmapNodeStatus | string
  progress?: number
  prerequisites?: ApiId[]
  resources?: Array<string | RoadmapNodeResourceDto>
  position?: { x: number; y: number } | null
  conceptId?: ApiId | null
  concept_id?: ApiId | null
  evidenceSummary?: string | null
  evidence_summary?: string | null
  manualOverride?: boolean
  manual_override?: boolean
}

export type RoadmapDto = {
  id: ApiId
  role: string
  domain?: string | null
  category?: RoadmapCategory
  description?: string
  version?: string | number
  source: 'curated' | 'generated' | string
  reviewedAt?: IsoTimestamp | null
  reviewed_at?: IsoTimestamp | null
  status?: ApiStatus | string
  topicCount?: number
  topic_count?: number
  progress?: number
  coreTopics?: string[]
  core_topics?: string[]
  optionalTopics?: string[]
  optional_topics?: string[]
  nodes?: RoadmapNodeDto[]
  createdAt?: IsoTimestamp
  created_at?: IsoTimestamp
  updatedAt?: IsoTimestamp
  updated_at?: IsoTimestamp
}

export type UserRoadmapDto = {
  id: ApiId
  userId?: ApiId
  user_id?: ApiId
  roadmapId: ApiId
  roadmap_id?: ApiId
  roadmapVersion?: string | number
  roadmap_version?: string | number
  roadmap?: RoadmapDto
  nodes?: RoadmapNodeDto[]
  progress?: number
  createdAt?: IsoTimestamp
  created_at?: IsoTimestamp
}

export type GenerateRoadmapRequestDto = {
  role: string
  category?: string
  domain?: string
  goal?: string
}

/**
 * Proposed addition for background generation job status
 * Endpoint: GET /api/roadmaps/jobs/{jobId} or GET /api/roadmaps/generate/{jobId}
 */
export type RoadmapJobStatusDto = {
  jobId: ApiId
  job_id?: ApiId
  status: 'queued' | 'processing' | 'completed' | 'failed' | string
  progress?: number
  roadmapId?: ApiId | null
  roadmap_id?: ApiId | null
  error?: string | null
  createdAt?: IsoTimestamp
  created_at?: IsoTimestamp
}

export type NodeStatusOverrideRequestDto = {
  status: RoadmapNodeStatus | string
  manualOverride?: boolean
  manual_override?: boolean
}

export type NodeSessionResponseDto = {
  sessionId: ApiId
  session_id?: ApiId
  courseId?: ApiId | null
  course_id?: ApiId | null
  topic: string
  goal?: string
  knowledgeMode?: 'course_grounded' | 'general_knowledge'
  knowledge_mode?: 'course_grounded' | 'general_knowledge'
}
