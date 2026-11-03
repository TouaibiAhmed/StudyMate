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
}

export type CourseConcept = {
  id: string
  title: string
  progress: number
  status: 'Strong' | 'In progress' | 'Needs review'
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
}

export interface CourseService {
  listCourses(): Promise<CourseSummary[]>
  createCourse(input: CreateCourseInput): Promise<CourseSummary>
  getCourse(courseId: string): Promise<CourseDetail | undefined>
}
