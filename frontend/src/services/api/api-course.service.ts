import type { CourseConcept, CourseDetail, CourseService, CourseSubject, CourseSummary, CreateCourseInput } from '../contracts/courses'
import type { CourseConceptDto, CourseDto, CreateCourseRequestDto } from '../contracts/api/courses'
import { apiClient } from '../http-client'

function pageItems<T>(value: T[] | { items: T[] } | { courses: T[] } | undefined): T[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if ('items' in value && Array.isArray(value.items)) return value.items
  if ('courses' in value && Array.isArray(value.courses)) return value.courses
  return []
}

function determineColor(subject: string): CourseSummary['color'] {
  const s = subject.toLowerCase()
  if (s.includes('deep') || s.includes('neural') || s.includes('learning')) return 'forest'
  if (s.includes('stat') || s.includes('math') || s.includes('data')) return 'coral'
  if (s.includes('bio') || s.includes('health') || s.includes('med')) return 'sage'
  return 'lilac'
}

function determineIcon(subject: string): string {
  const s = subject.toLowerCase()
  if (s.includes('deep') || s.includes('neural')) return '∿'
  if (s.includes('stat') || s.includes('math')) return 'σ'
  if (s.includes('bio')) return '✣'
  if (s.includes('business')) return '↗'
  return '＋'
}

function normalizeConceptStatus(rawStatus?: string): CourseConcept['status'] {
  if (!rawStatus) return 'Not started'
  const s = rawStatus.toLowerCase()
  if (s.includes('not_enough_evidence') || s.includes('not_started')) return 'Not started'
  if (s.includes('strong') || s.includes('mastered') || s.includes('good_evidence')) return 'Strong'
  if (s.includes('need') || s.includes('review') || s.includes('weak') || s.includes('practice')) return 'Needs review'
  return 'In progress'
}

export function mapCourseDtoToSummary(dto: CourseDto): CourseSummary {
  const subject = (dto.subject || 'Deep Learning') as CourseSubject
  const level = (dto.level || 'Intermediate') as CourseSummary['level']
  const color = determineColor(subject)
  const icon = determineIcon(subject)

  return {
    id: dto.id,
    title: dto.title,
    subject,
    level,
    description: dto.description || `Study materials and concepts for ${dto.title}.`,
    lastStudied: dto.lastStudied || dto.last_studied || 'Not started',
    progress: typeof dto.progress === 'number' ? dto.progress : 0,
    completedMaterials: dto.completedMaterials || dto.completed_materials || 0,
    materialCount: dto.materialCount || dto.material_count || 0,
    color,
    icon,
    domain: dto.domain ?? undefined,
    conceptsStatus: dto.conceptsStatus,
  }
}

export function mapConceptDtoToConcept(dto: CourseConceptDto): CourseConcept {
  return {
    id: dto.id,
    title: dto.title || dto.name || 'Untitled Concept',
    progress: typeof dto.progress === 'number' ? dto.progress : 0,
    status: normalizeConceptStatus(dto.status),
  }
}

export const apiCourseService: CourseService = {
  async listCourses(): Promise<CourseSummary[]> {
    const response = await apiClient.get<CourseDto[] | { items: CourseDto[] } | { courses: CourseDto[] }>('/api/courses')
    return pageItems(response.data).map(mapCourseDtoToSummary)
  },

  async createCourse(input: CreateCourseInput): Promise<CourseSummary> {
    // The backend derives the domain type from subject/domain.
    const payload: CreateCourseRequestDto = {
      title: input.title.trim(),
      subject: input.subject,
      level: input.level,
      description: input.description.trim(),
      domain: input.domain,
    }

    const response = await apiClient.post<CourseDto>('/api/courses', payload)
    return mapCourseDtoToSummary(response.data)
  },

  async getCourse(courseId: string): Promise<CourseDetail | undefined> {
    const [courseResponse, conceptsResponse] = await Promise.all([
      apiClient.get<CourseDto>(`/api/courses/${courseId}`),
      apiClient.get<CourseConceptDto[] | { items: CourseConceptDto[] }>(`/api/courses/${courseId}/concepts`).catch(() => undefined),
    ])

    const courseDto = courseResponse.data
    if (!courseDto) return undefined

    const summary = mapCourseDtoToSummary(courseDto)
    const rawConcepts = conceptsResponse ? pageItems(conceptsResponse.data) : courseDto.concepts ?? []
    const concepts = rawConcepts.map(mapConceptDtoToConcept)
    const sessions = (courseDto.sessions ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      date: s.date || 'Recent',
      duration: s.duration || '30 min',
      score: s.score ?? undefined,
    }))

    return {
      ...summary,
      concepts,
      sessions,
    }
  },

  async deleteCourse(courseId: string): Promise<void> {
    await apiClient.delete(`/api/courses/${courseId}`)
  },

  async extractConcepts(courseId: string): Promise<CourseSummary> {
    const response = await apiClient.post<CourseDto>(`/api/courses/${courseId}/concepts/extract`)
    return mapCourseDtoToSummary(response.data)
  },

  async getConcepts(courseId: string): Promise<CourseConcept[]> {
    const response = await apiClient.get<CourseConceptDto[] | { items: CourseConceptDto[] }>(`/api/courses/${courseId}/concepts`)
    return pageItems(response.data).map(mapConceptDtoToConcept)
  },
}
