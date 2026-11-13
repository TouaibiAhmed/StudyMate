import type { CatalogCourse, CatalogService, Recommendation } from '../contracts/catalog'

const catalog: CatalogCourse[] = [
  { id: 'cat-ml', slug: 'intro-machine-learning', title: 'Introduction to Machine Learning', subject: 'Machine Learning', level: 'Intermediate', domains: ['Computer Science & IT'], hours: 30, description: 'How models learn from data and how to evaluate them honestly.', conceptCount: 3, concepts: [{ name: 'Supervised learning', description: '' }, { name: 'Overfitting and regularization', description: '' }, { name: 'Clustering', description: '' }], enrolledCourseId: null },
  { id: 'cat-stats', slug: 'statistics-data-analysis', title: 'Statistics for Data Analysis', subject: 'Statistics', level: 'Beginner', domains: ['Health & Medicine', 'Business'], hours: 25, description: 'Describe data, quantify uncertainty and test ideas.', conceptCount: 3, concepts: [{ name: 'Descriptive statistics', description: '' }, { name: 'Hypothesis testing', description: '' }, { name: 'Correlation and regression', description: '' }], enrolledCourseId: null },
]
const dismissed = new Set<string>()

export const mockCatalogService: CatalogService = {
  async listCatalog(filter = {}) {
    const q = filter.query?.toLowerCase().trim() ?? ''
    return catalog.filter((c) => (!q || `${c.title} ${c.description}`.toLowerCase().includes(q)) && (!filter.domain || c.domains.includes(filter.domain)))
  },
  async enroll(catalogId) {
    const course = catalog.find((c) => c.id === catalogId)
    if (course) course.enrolledCourseId = 'deep-learning'
    return { courseId: 'deep-learning' }
  },
  async getRecommendations(kind, limit = 4) {
    if (kind === 'roadmap') return [{ kind, itemId: 'data-analyst', title: 'Data Analyst', subtitle: 'Data · 8 topics', description: 'Turn messy questions into decision-ready insights.', reason: 'Matches your field', reasons: ['Matches your field'], score: 0.9, href: '/roadmaps/data-analyst' } satisfies Recommendation].filter((r) => !dismissed.has(r.itemId)).slice(0, limit)
    return catalog.filter((c) => !c.enrolledCourseId && !dismissed.has(c.id)).slice(0, limit).map((c) => ({ kind, itemId: c.id, title: c.title, subtitle: `${c.level} · ${c.subject} · about ${c.hours} h`, description: c.description, reason: 'Matches your field', reasons: ['Matches your field'], score: 0.9, href: `/courses?catalog=${c.id}` }))
  },
  async dismiss(_kind, itemId) { dismissed.add(itemId) },
  async resetDismissed() { dismissed.clear() },
}
