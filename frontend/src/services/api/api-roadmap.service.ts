import type {
  CreateRoadmapInput,
  RoadmapCategory,
  RoadmapDetail,
  RoadmapGraphData,
  RoadmapGraphEdge,
  RoadmapGraphTopic,
  RoadmapService,
  RoadmapSource,
  RoadmapSummary,
  RoadmapTopic,
  RoadmapTopicStatus,
} from '../contracts/roadmaps'
import type {
  GenerateRoadmapRequestDto,
  NodeSessionResponseDto,
  RoadmapDto,
  RoadmapJobStatusDto,
  RoadmapNodeDto,
  UserRoadmapDto,
} from '../contracts/api/roadmaps'
import { apiClient } from '../http-client'

function pageItems<T>(value: T[] | { items: T[] } | { roadmaps: T[] } | undefined): T[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if ('items' in value && Array.isArray(value.items)) return value.items
  if ('roadmaps' in value && Array.isArray(value.roadmaps)) return value.roadmaps
  return []
}

function normalizeCategory(category?: string): RoadmapCategory {
  if (!category) return 'Engineering'
  const c = category.toLowerCase()
  if (c.includes('data')) return 'Data'
  if (c.includes('machine') || c.includes('ml') || c.includes('ai')) return 'Machine learning'
  if (c.includes('business')) return 'Business'
  return 'Engineering'
}

function determineColor(category: RoadmapCategory): RoadmapSummary['color'] {
  if (category === 'Data') return 'purple'
  if (category === 'Engineering') return 'green'
  if (category === 'Machine learning') return 'orange'
  return 'blue'
}

function normalizeNodeStatus(rawStatus?: string): RoadmapTopicStatus {
  if (!rawStatus) return 'Not started'
  const s = rawStatus.toLowerCase().replaceAll(/[-_]/g, ' ').trim()
  if (s === 'completed' || s === 'done') return 'Completed'
  if (s === 'in progress' || s === 'in_progress') return 'In progress'
  if (s === 'known') return 'Known'
  return 'Not started'
}

function toBackendNodeStatus(status: RoadmapTopicStatus): string {
  if (status === 'Completed') return 'completed'
  if (status === 'In progress') return 'in_progress'
  if (status === 'Known') return 'known'
  return 'not_started'
}

function mapRoadmapDtoToSummary(dto: RoadmapDto): RoadmapSummary {
  const category = normalizeCategory(dto.category || dto.domain || undefined)
  const isGenerated = dto.source === 'generated' || String(dto.source).toLowerCase().includes('ai')
  const source: RoadmapSource = isGenerated ? 'AI-generated mock' : 'Curated by Study Partner'
  const color = determineColor(category)

  const nodes = dto.nodes || []
  const coreTopics = dto.coreTopics || dto.core_topics || nodes.filter((n) => !n.optional && n.type !== 'optional').map((n) => n.title).slice(0, 4)
  const optionalTopics = dto.optionalTopics || dto.optional_topics || nodes.filter((n) => n.optional || n.type === 'optional').map((n) => n.title).slice(0, 2)
  const topicCount = dto.topicCount || dto.topic_count || (nodes.length ? nodes.length : coreTopics.length + optionalTopics.length)

  return {
    id: dto.id,
    role: dto.role,
    category,
    description: dto.description || `Learning path and topic progression for ${dto.role}.`,
    topicCount: topicCount || 6,
    coreTopics: coreTopics.length ? coreTopics : ['Foundations', 'Core workflows', 'Application'],
    optionalTopics: optionalTopics.length ? optionalTopics : ['Advanced tools'],
    progress: typeof dto.progress === 'number' ? dto.progress : 0,
    source,
    color,
  }
}

function mapNodesToGraph(roadmapId: string, nodes: RoadmapNodeDto[]): RoadmapGraphData {
  const topics: RoadmapGraphTopic[] = nodes.map((node, index) => {
    const isOptional = Boolean(node.optional || node.type === 'optional')
    const resources = (node.resources || []).map((r) => typeof r === 'string' ? r : r.title)
    const position = node.position && typeof node.position.x === 'number'
      ? node.position
      : { x: (index % 3) * 260, y: Math.floor(index / 3) * 150 }

    return {
      id: node.id || node.nodeId || node.node_id || `node-${index}`,
      title: node.title,
      description: node.description || `Build understanding of ${node.title}.`,
      optional: isOptional,
      status: normalizeNodeStatus(node.status),
      progress: typeof node.progress === 'number' ? node.progress : 0,
      prerequisites: node.prerequisites || [],
      resources: resources.length ? resources : [`${node.title} guide`],
      position,
    }
  })

  const edges: RoadmapGraphEdge[] = []
  nodes.forEach((node, index) => {
    const targetId = node.id || node.nodeId || node.node_id || `node-${index}`
    if (node.prerequisites && node.prerequisites.length > 0) {
      node.prerequisites.forEach((prereqId, pIndex) => {
        edges.push({
          id: `edge-${prereqId}-${targetId}-${pIndex}`,
          source: prereqId,
          target: targetId,
        })
      })
    } else if (index > 0 && edges.length === 0 && nodes.length <= 10) {
      // Linear prerequisite fallback if prerequisites array is not populated
      const prevId = nodes[index - 1].id || `node-${index - 1}`
      edges.push({
        id: `fallback-edge-${prevId}-${targetId}`,
        source: prevId,
        target: targetId,
      })
    }
  })

  return { topics, edges }
}

export const apiRoadmapService: RoadmapService = {
  async listRoadmaps(): Promise<RoadmapSummary[]> {
    const response = await apiClient.get<RoadmapDto[] | { items: RoadmapDto[] } | { roadmaps: RoadmapDto[] }>('/api/roadmaps')
    return pageItems(response.data).map(mapRoadmapDtoToSummary)
  },

  async getRoadmap(id: string): Promise<RoadmapDetail | undefined> {
    // Check user-roadmaps first, fallback to curated roadmaps endpoint
    const response = await apiClient.get<UserRoadmapDto | RoadmapDto>(`/api/user-roadmaps/${id}`).catch(() =>
      apiClient.get<RoadmapDto>(`/api/roadmaps/${id}`)
    )

    const raw = response.data
    if (!raw) return undefined

    const dto: RoadmapDto = 'roadmap' in raw && raw.roadmap ? { ...raw.roadmap, nodes: raw.nodes ?? raw.roadmap.nodes } : (raw as RoadmapDto)
    const summary = mapRoadmapDtoToSummary(dto)

    const rawNodes = dto.nodes || ('nodes' in raw ? (raw as UserRoadmapDto).nodes : []) || []
    const topics: RoadmapTopic[] = rawNodes.map((node) => ({
      id: node.id || node.nodeId || node.node_id || '',
      name: node.title,
      optional: Boolean(node.optional || node.type === 'optional'),
      completed: normalizeNodeStatus(node.status) === 'Completed' || normalizeNodeStatus(node.status) === 'Known',
    }))

    const note = dto.source === 'generated'
      ? 'This generated roadmap is an AI suggestion. Verify it against trusted domain resources; it is not an official career requirement.'
      : 'Curated by the Study Partner team. Adapt the sequence to your field and background.'

    return {
      ...summary,
      topics,
      note,
    }
  },

  async createRoadmap(input: CreateRoadmapInput): Promise<RoadmapDetail> {
    const payload: GenerateRoadmapRequestDto = {
      role: input.role.trim(),
      category: input.category,
      goal: input.goal.trim(),
    }

    const response = await apiClient.post<RoadmapDto | RoadmapJobStatusDto>('/api/roadmaps/generate', payload)
    const resData = response.data

    // If backend returns an immediate roadmap
    if ('role' in resData && resData.role) {
      const summary = mapRoadmapDtoToSummary(resData as RoadmapDto)
      const nodes = (resData as RoadmapDto).nodes || []
      return {
        ...summary,
        topics: nodes.map((n) => ({ id: n.id, name: n.title, completed: false, optional: Boolean(n.optional) })),
        note: 'AI-generated roadmap. Verify suggestions against industry requirements.',
      }
    }

    // If backend returns background job status { jobId, status }:
    // Proposed asynchronous contract: GET /api/roadmaps/jobs/{jobId} or GET /api/roadmaps/generate/{jobId}
    const jobId = (resData as RoadmapJobStatusDto).jobId || (resData as RoadmapJobStatusDto).job_id
    if (jobId) {
      let attempts = 0
      while (attempts < 15) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        attempts++
        try {
          const statusRes = await apiClient.get<RoadmapJobStatusDto>(`/api/roadmaps/jobs/${jobId}`).catch(() =>
            apiClient.get<RoadmapJobStatusDto>(`/api/roadmaps/generate/${jobId}`)
          )
          const job = statusRes.data
          if (job.status === 'completed' && (job.roadmapId || job.roadmap_id)) {
            const finishedRoadmap = await this.getRoadmap(job.roadmapId || job.roadmap_id!)
            if (finishedRoadmap) return finishedRoadmap
          }
          if (job.status === 'failed') {
            throw new Error(job.error || 'Roadmap generation failed on the server.')
          }
        } catch (err) {
          if (attempts >= 15) throw err
        }
      }
    }

    // Default synthesized detail while backend finishes
    const id = `generated-${input.role.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`
    return {
      id,
      role: input.role,
      category: input.category,
      description: `Targeted learning progression for ${input.role} shaped around: ${input.goal}.`,
      topicCount: 6,
      coreTopics: ['Role foundations', 'Tools and workflows', 'Core application'],
      optionalTopics: ['Advanced workflows'],
      progress: 0,
      source: 'AI-generated mock',
      color: determineColor(input.category),
      topics: ['Role foundations', 'Tools and workflows', 'Core application', 'Practical projects', 'Advanced workflows'].map((name, i) => ({
        id: `gen-node-${i}`,
        name,
        optional: i >= 4,
        completed: false,
      })),
      note: 'Roadmaps are learning suggestions, not official career requirements.',
    }
  },

  async getGraph(id: string): Promise<RoadmapGraphData | undefined> {
    const response = await apiClient.get<UserRoadmapDto | RoadmapDto>(`/api/user-roadmaps/${id}`).catch(() =>
      apiClient.get<RoadmapDto>(`/api/roadmaps/${id}`)
    )

    const raw = response.data
    if (!raw) return undefined

    const nodes = (raw as UserRoadmapDto).nodes || (raw as RoadmapDto).nodes || []
    if (nodes.length > 0) {
      return mapNodesToGraph(id, nodes)
    }

    return undefined
  },

  async overrideNodeStatus(roadmapId: string, nodeId: string, status: RoadmapTopicStatus): Promise<void> {
    const payload = {
      status: toBackendNodeStatus(status),
      manual_override: true,
      manualOverride: true,
    }

    await apiClient.patch(`/api/user-roadmaps/${roadmapId}/nodes/${nodeId}`, payload)
  },

  async startNodeSession(roadmapId: string, nodeId: string): Promise<{ id: string; topic: string }> {
    const response = await apiClient.post<NodeSessionResponseDto>(`/api/user-roadmaps/${roadmapId}/nodes/${nodeId}/sessions`)
    const data = response.data
    return {
      id: data.sessionId || data.session_id || 'session-general-01',
      topic: data.topic || 'Roadmap node study',
    }
  },

  async followRoadmap(roadmapId: string): Promise<{ userRoadmapId: string }> {
    const response = await apiClient.post<{ id?: string; userRoadmapId?: string; user_roadmap_id?: string }>('/api/user-roadmaps', {
      roadmap_id: roadmapId,
      roadmapId,
    })
    return {
      userRoadmapId: response.data.id || response.data.userRoadmapId || response.data.user_roadmap_id || roadmapId,
    }
  },
}
