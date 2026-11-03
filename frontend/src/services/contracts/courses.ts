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

export type CreateCourseInput = {
  title: string
  subject: CourseSubject
  level: CourseLevel
  description: string
}

export interface CourseService {
  listCourses(): Promise<CourseSummary[]>
  createCourse(input: CreateCourseInput): Promise<CourseSummary>
}
