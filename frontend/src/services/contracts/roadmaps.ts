export type RoadmapCategory = 'Data' | 'Engineering' | 'Machine learning' | 'Business'
export type RoadmapSource = 'Curated by Study Partner' | 'AI-generated mock'

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
  role: string
  category: RoadmapCategory
  description: string
  topicCount: number
  coreTopics: string[]
  optionalTopics: string[]
  progress: number
  source: RoadmapSource
  color: 'purple' | 'orange' | 'green' | 'blue'
}

export type RoadmapDetail = RoadmapSummary & {
  topics: RoadmapTopic[]
  note: string
}

export type CreateRoadmapInput = {
  role: string
  category: RoadmapCategory
  goal: string
}

export interface RoadmapService {
  listRoadmaps(): Promise<RoadmapSummary[]>
  getRoadmap(id: string): Promise<RoadmapDetail | undefined>
  createRoadmap(input: CreateRoadmapInput): Promise<RoadmapDetail>
}
