import type {
  CreateRoadmapInput,
  NodeSession,
  RoadmapCategory,
  RoadmapDetail,
  RoadmapGraphData,
  RoadmapGraphEdge,
  RoadmapGraphTopic,
  RoadmapService,
  RoadmapSummary,
  RoadmapTopicStatus,
} from '../contracts/roadmaps'
import type { GenerateRoadmapRequestDto, NodeSessionResponseDto, RoadmapDto, RoadmapNodeDto } from '../contracts/api/roadmaps'
import { apiClient } from '../http-client'

// Backend: /api/roadmaps (curated + the student's private generated roadmaps). Node status is computed
// per student from their study evidence, with optional manual marks.

const CATEGORY_LABELS: Record<string, RoadmapCategory> = {
  data: 'Data',
  engineering: 'Engineering',
  machine_learning: 'Machine learning',
  business: 'Business',
}

const CATEGORY_KEYS: Record<RoadmapCategory, string> = {
  Data: 'data',
  Engineering: 'engineering',
  'Machine learning': 'machine_learning',
  Business: 'business',
}

const COLORS: Record<RoadmapCategory, RoadmapSummary['color']> = {
  Data: 'purple',
  Engineering: 'green',
  'Machine learning': 'orange',
  Business: 'blue',
}

function toStatus(raw?: string): RoadmapTopicStatus {
  if (raw === 'completed') return 'Completed'
  if (raw === 'in_progress') return 'In progress'
  if (raw === 'known') return 'Known'
  return 'Not started'
}

function toBackendStatus(status: RoadmapTopicStatus): string {
  if (status === 'Completed') return 'completed'
  if (status === 'In progress') return 'in_progress'
  if (status === 'Known') return 'known'
  return 'not_started'
}

function toSummary(dto: RoadmapDto): RoadmapSummary {
  const category = CATEGORY_LABELS[dto.category ?? ''] ?? 'Engineering'
  return {
    id: dto.id,
    slug: dto.slug,
    role: dto.role,
    category,
    description: dto.description ?? '',
    topicCount: dto.topicCount ?? dto.nodes?.length ?? 0,
    coreTopics: dto.coreTopics ?? [],
    optionalTopics: dto.optionalTopics ?? [],
    progress: dto.progress ?? 0,
    source: dto.source === 'generated' ? 'AI-generated' : 'Curated by Study Partner',
    color: COLORS[category],
    status: (dto.status as RoadmapSummary['status']) ?? 'ready',
    following: dto.following,
  }
}

function toDetail(dto: RoadmapDto): RoadmapDetail {
  return {
    ...toSummary(dto),
    note: dto.note ?? '',
    topics: (dto.nodes ?? []).map((node) => ({
      id: node.id,
      name: node.title,
      optional: node.type === 'optional',
      completed: node.status === 'completed' || node.status === 'known',
    })),
    generationProgress: dto.generationProgress,
    stage: dto.stage,
    error: dto.error,
  }
}

function toGraph(nodes: RoadmapNodeDto[]): RoadmapGraphData {
  const topics: RoadmapGraphTopic[] = nodes.map((node) => ({
    id: node.id,
    title: node.title,
    description: node.description ?? '',
    optional: node.type === 'optional',
    status: toStatus(node.status),
    progress: node.progress ?? 0,
    prerequisites: node.prerequisites ?? [],
    resources: (node.resources ?? []).map((r) => (typeof r === 'string' ? r : r.title)),
    position: node.position ?? { x: 0, y: 0 },
    evidenceSummary: node.evidenceSummary,
    conceptName: node.conceptName,
    manualOverride: Boolean(node.manualOverride),
  }))
  const edges: RoadmapGraphEdge[] = nodes.flatMap((node) =>
    (node.prerequisites ?? []).map((source) => ({ id: `${source}->${node.id}`, source, target: node.id })),
  )
  return { topics, edges }
}

// The detail page asks for the roadmap and its graph at the same time: share one request.
const inFlight = new Map<string, Promise<RoadmapDto>>()
function fetchRoadmap(id: string): Promise<RoadmapDto> {
  const pending = inFlight.get(id)
  if (pending) return pending
  const request = apiClient.get<RoadmapDto>(`/api/roadmaps/${id}`).then((r) => r.data)
  inFlight.set(id, request)
  void request.finally(() => window.setTimeout(() => inFlight.delete(id), 300)).catch(() => undefined)
  return request
}

async function getOrUndefined(id: string): Promise<RoadmapDto | undefined> {
  try {
    return await fetchRoadmap(id)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'not-found') return undefined
    throw error
  }
}

export const apiRoadmapService: RoadmapService = {
  async listRoadmaps(): Promise<RoadmapSummary[]> {
    const response = await apiClient.get<RoadmapDto[]>('/api/roadmaps')
    return response.data.map(toSummary)
  },

  async getRoadmap(id: string): Promise<RoadmapDetail | undefined> {
    const dto = await getOrUndefined(id)
    return dto ? toDetail(dto) : undefined
  },

  async getGraph(id: string): Promise<RoadmapGraphData | undefined> {
    const dto = await getOrUndefined(id)
    return dto?.nodes?.length ? toGraph(dto.nodes) : undefined
  },

  async createRoadmap(input: CreateRoadmapInput): Promise<RoadmapDetail> {
    const payload: GenerateRoadmapRequestDto = {
      role: input.role.trim(),
      category: CATEGORY_KEYS[input.category],
      goal: input.goal.trim(),
    }
    // 202: the local model writes the roadmap in the background (a few minutes on CPU).
    const response = await apiClient.post<RoadmapDto>('/api/roadmaps/generate', payload)
    return toDetail(response.data)
  },

  async retryRoadmap(id: string): Promise<RoadmapDetail> {
    const response = await apiClient.post<RoadmapDto>(`/api/roadmaps/${id}/retry`)
    return toDetail(response.data)
  },

  async deleteRoadmap(id: string): Promise<void> {
    await apiClient.delete(`/api/roadmaps/${id}`)
  },

  async overrideNodeStatus(roadmapId: string, nodeId: string, status: RoadmapTopicStatus | null): Promise<void> {
    await apiClient.patch(`/api/roadmaps/${roadmapId}/nodes/${nodeId}`, {
      status: status ? toBackendStatus(status) : null,
    })
  },

  async startNodeSession(roadmapId: string, nodeId: string): Promise<NodeSession> {
    const response = await apiClient.post<NodeSessionResponseDto>(`/api/roadmaps/${roadmapId}/nodes/${nodeId}/sessions`)
    return { sessionId: response.data.sessionId, topic: response.data.topic, knowledgeMode: response.data.knowledgeMode }
  },

  async followRoadmap(roadmapId: string): Promise<{ userRoadmapId: string }> {
    await apiClient.put(`/api/roadmaps/${roadmapId}/follow`)
    return { userRoadmapId: roadmapId }
  },
}
