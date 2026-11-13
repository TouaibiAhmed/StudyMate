import type { CatalogCourse, CatalogService, Recommendation, RecommendationKind } from '../contracts/catalog'
import { apiClient } from '../http-client'

// Backend: /api/catalog/courses and /api/recommendations (catalog courses + curated roadmaps only).

export const apiCatalogService: CatalogService = {
  async listCatalog(filter = {}): Promise<CatalogCourse[]> {
    const params = new URLSearchParams()
    if (filter.query?.trim()) params.set('query', filter.query.trim())
    if (filter.domain) params.set('domain', filter.domain)
    const qs = params.toString()
    return (await apiClient.get<CatalogCourse[]>(`/api/catalog/courses${qs ? `?${qs}` : ''}`)).data
  },

  async enroll(catalogId: string): Promise<{ courseId: string }> {
    const course = (await apiClient.post<{ id: string }>(`/api/catalog/courses/${catalogId}/enroll`)).data
    return { courseId: course.id }
  },

  async getRecommendations(kind: RecommendationKind, limit = 4): Promise<Recommendation[]> {
    return (await apiClient.get<Recommendation[]>(`/api/recommendations?type=${kind}&limit=${limit}`)).data
  },

  async dismiss(kind: RecommendationKind, itemId: string): Promise<void> {
    await apiClient.post('/api/recommendations/feedback', { kind, itemId, action: 'dismiss' })
  },

  async resetDismissed(): Promise<void> {
    await apiClient.delete('/api/recommendations/feedback')
  },
}
