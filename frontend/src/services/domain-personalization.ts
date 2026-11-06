import type { CourseSummary, CourseSubject } from './contracts/courses'
import type { ExamCourseOption } from './contracts/exams'
import type { RoadmapCategory, RoadmapSummary } from './contracts/roadmaps'

export type LearningProfile = {
  domain?: string
  specialization?: string
  fieldOfStudy?: string
}

const domainSubjects: Record<string, CourseSubject[]> = {
  'Computer Science & IT': ['Deep Learning', 'Statistics'],
  Engineering: ['Statistics'],
  Business: ['Business Fundamentals', 'Statistics'],
  'Health & Medicine': ['Biology', 'Statistics'],
  'Humanities & Social Sciences': ['Statistics'],
}

const domainRoadmapCategories: Record<string, RoadmapCategory[]> = {
  'Computer Science & IT': ['Machine learning', 'Engineering', 'Data'],
  Engineering: ['Engineering', 'Data'],
  Business: ['Business', 'Data'],
  'Health & Medicine': ['Data'],
  'Humanities & Social Sciences': ['Business', 'Data'],
}

const specializationRoadmapIds: Record<string, string[]> = {
  AI: ['machine-learning-engineer'],
  'Data Science': ['data-analyst', 'machine-learning-engineer'],
  'Software Engineering': ['backend-developer'],
  Cybersecurity: ['backend-developer'],
  Networks: ['backend-developer'],
  Finance: ['data-analyst'],
  Marketing: ['data-analyst', 'product-operations'],
}

export function getRelevantCourseSubjects(profile?: LearningProfile): CourseSubject[] {
  return profile?.domain ? domainSubjects[profile.domain] ?? [] : []
}

export function isCourseRelevant(course: Pick<CourseSummary, 'domain'> & { subject: string }, profile?: LearningProfile) {
  return Boolean(profile?.domain && (course.domain === profile.domain || getRelevantCourseSubjects(profile).includes(course.subject as CourseSubject)))
}

export function prioritizeCourses<T extends Pick<CourseSummary, 'domain'> & { subject: string }>(courses: T[], profile?: LearningProfile) {
  return [...courses].sort((a, b) => Number(isCourseRelevant(b, profile)) - Number(isCourseRelevant(a, profile)))
}

export function isRoadmapRelevant(roadmap: Pick<RoadmapSummary, 'category' | 'id'>, profile?: LearningProfile) {
  const specializationMatches = profile?.specialization ? specializationRoadmapIds[profile.specialization]?.includes(roadmap.id) : false
  return Boolean(specializationMatches || (profile?.domain && domainRoadmapCategories[profile.domain]?.includes(roadmap.category)))
}

export function prioritizeRoadmaps<T extends Pick<RoadmapSummary, 'category' | 'id'>>(roadmaps: T[], profile?: LearningProfile) {
  return [...roadmaps].sort((a, b) => Number(isRoadmapRelevant(b, profile)) - Number(isRoadmapRelevant(a, profile)))
}

export function isExamRelevant(option: Pick<ExamCourseOption, 'id'>, profile?: LearningProfile) {
  const subject = option.id === 'deep-learning' ? 'Deep Learning' : option.id === 'statistics' ? 'Statistics' : option.id === 'biology' ? 'Biology' : undefined
  return Boolean(subject && getRelevantCourseSubjects(profile).includes(subject))
}

export function prioritizeExams<T extends Pick<ExamCourseOption, 'id'>>(options: T[], profile?: LearningProfile) {
  return [...options].sort((a, b) => Number(isExamRelevant(b, profile)) - Number(isExamRelevant(a, profile)))
}
