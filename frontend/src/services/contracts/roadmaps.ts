export type RoadmapCategory = 'Data' | 'Engineering' | 'Machine learning' | 'Business'
export type RoadmapSource = 'Curated by Study Partner' | 'AI-generated'
/** generating/failed only for roadmaps the student asked the AI model for. */
export type RoadmapGenerationStatus = 'generating' | 'ready' | 'failed'

export type RoadmapTopic = {
  id: string
  name: string
  optional?: boolean
  completed: boolean
}

export type RoadmapTopicStatus = 'Not started' | 'In progress' | 'Completed' | 'Known'

export type RoadmapGraphTopic = {
  id: string
  title: string
  description: string
  optional: boolean
  status: RoadmapTopicStatus
  progress: number
  prerequisites: string[]
  resources: string[]
  position: { x: number; y: number }
  /** Why the topic has its status (evidence from study sessions or courses, or a manual mark). */
  evidenceSummary?: string | null
  /** Concept of the student's own course that this topic is connected to, if any. */
  conceptName?: string | null
  manualOverride?: boolean
}

export type RoadmapGraphEdge = {
  id: string
  source: string
  target: string
}

export type RoadmapGraphData = {
  topics: RoadmapGraphTopic[]
  edges: RoadmapGraphEdge[]
}

export type RoadmapSummary = {
  id: string
  /** Stable name of a curated roadmap (used for personalization); absent for generated ones. */
  slug?: string | null
  role: string
  category: RoadmapCategory
  description: string
  topicCount: number
  coreTopics: string[]
  optionalTopics: string[]
  progress: number
  source: RoadmapSource
  color: 'purple' | 'orange' | 'green' | 'blue'
  status?: RoadmapGenerationStatus
  following?: boolean
}

export type RoadmapDetail = RoadmapSummary & {
  topics: RoadmapTopic[]
  note: string
  /** Generation progress (0-1) and stage while the AI model writes the roadmap. */
  generationProgress?: number
  stage?: string | null
  error?: string | null
}

export type NodeSession = { sessionId: string; topic: string; knowledgeMode?: 'course_grounded' | 'general_knowledge' }

export type CreateRoadmapInput = {
  role: string
  category: RoadmapCategory
  goal: string
}

export interface RoadmapService {
  listRoadmaps(): Promise<RoadmapSummary[]>
  getRoadmap(id: string): Promise<RoadmapDetail | undefined>
  /** api mode: returns at once with status 'generating'; poll getRoadmap until it is ready. */
  createRoadmap(input: CreateRoadmapInput): Promise<RoadmapDetail>
  getGraph?(id: string): Promise<RoadmapGraphData | undefined>
  /** status null removes the manual status: the topic follows the evidence again. */
  overrideNodeStatus?(roadmapId: string, nodeId: string, status: RoadmapTopicStatus | null): Promise<void>
  startNodeSession?(roadmapId: string, nodeId: string): Promise<NodeSession>
  followRoadmap?(roadmapId: string): Promise<{ userRoadmapId: string }>
  retryRoadmap?(roadmapId: string): Promise<RoadmapDetail>
  deleteRoadmap?(roadmapId: string): Promise<void>
}
