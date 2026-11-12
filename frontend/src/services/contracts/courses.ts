export type CourseSubject = 'Deep Learning' | 'Statistics' | 'Biology' | 'Business Fundamentals'
export type CourseLevel = 'Beginner' | 'Intermediate' | 'Advanced'

export type CourseSummary = {
  id: string
  title: string
  subject: CourseSubject
  level: CourseLevel
  description: string
  lastStudied: string
  progress: number
  completedMaterials: number
  materialCount: number
  color: 'forest' | 'coral' | 'sage' | 'lilac'
  icon: string
  domain?: string
  /** Concept extraction state of the course's documents (api mode). */
  conceptsStatus?: 'idle' | 'processing' | 'ready' | 'failed'
}

export type CourseConcept = {
  id: string
  title: string
  progress: number
  status: 'Strong' | 'In progress' | 'Needs review' | 'Not started'
}

export type CourseStudySession = {
  id: string
  title: string
  date: string
  duration: string
  score?: string
}

export type CourseDetail = CourseSummary & {
  concepts: CourseConcept[]
  sessions: CourseStudySession[]
}

export type CreateCourseInput = {
  title: string
  subject: CourseSubject
  level: CourseLevel
  description: string
  domain?: string
}

export interface CourseService {
  listCourses(): Promise<CourseSummary[]>
  createCourse(input: CreateCourseInput): Promise<CourseSummary>
  getCourse(courseId: string): Promise<CourseDetail | undefined>
  deleteCourse(courseId: string): Promise<void>
  getConcepts?(courseId: string): Promise<CourseConcept[]>
  /** Re-run concept extraction over the course's ready documents (api mode). */
  extractConcepts?(courseId: string): Promise<CourseSummary>
}
