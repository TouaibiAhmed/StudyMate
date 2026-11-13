/** Platform catalog courses (templates the student can add to their library) and recommendations. */

export type CatalogCourse = {
  id: string
  slug: string
  title: string
  subject: string
  level: 'Beginner' | 'Intermediate' | 'Advanced' | string
  domains: string[]
  hours: number
  description: string
  conceptCount: number
  concepts: { name: string; description: string }[]
  /** The student's own copy, once added. */
  enrolledCourseId: string | null
}

export type RecommendationKind = 'course' | 'roadmap'

export type Recommendation = {
  kind: RecommendationKind
  itemId: string
  title: string
  subtitle: string
  description: string
  /** Why it is suggested, e.g. "Because you follow the Data Analyst roadmap". */
  reason: string
  reasons: string[]
  score: number
  href: string
}

export interface CatalogService {
  listCatalog(filter?: { query?: string; domain?: string }): Promise<CatalogCourse[]>
  /** Adds the catalog course to the student's library; returns their course id. */
  enroll(catalogId: string): Promise<{ courseId: string }>
  getRecommendations(kind: RecommendationKind, limit?: number): Promise<Recommendation[]>
  dismiss(kind: RecommendationKind, itemId: string): Promise<void>
  resetDismissed(): Promise<void>
}
