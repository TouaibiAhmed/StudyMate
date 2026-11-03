import type { CourseService, CourseSummary } from '../contracts/courses'

let nextCourseNumber = 1

const mockCourses: CourseSummary[] = [
  {
    id: 'deep-learning',
    title: 'Deep Learning',
    subject: 'Deep Learning',
    level: 'Advanced',
    description: 'Build intuition for neural networks, optimization, and the models behind modern AI.',
    lastStudied: 'Today, 9:20 AM',
    progress: 64,
    completedMaterials: 16,
    materialCount: 25,
    color: 'forest',
    icon: '∿',
  },
  {
    id: 'statistics',
    title: 'Statistics for Research',
    subject: 'Statistics',
    level: 'Intermediate',
    description: 'Turn uncertainty into useful evidence with distributions, inference, and clear interpretation.',
    lastStudied: 'Yesterday, 4:45 PM',
    progress: 38,
    completedMaterials: 9,
    materialCount: 24,
    color: 'coral',
    icon: 'σ',
  },
  {
    id: 'biology',
    title: 'Cell Biology',
    subject: 'Biology',
    level: 'Beginner',
    description: 'Explore how cells organize, communicate, and keep living systems in motion.',
    lastStudied: 'Monday, 11:10 AM',
    progress: 21,
    completedMaterials: 5,
    materialCount: 18,
    color: 'sage',
    icon: '✣',
  },
  {
    id: 'business-fundamentals',
    title: 'Business Fundamentals',
    subject: 'Business Fundamentals',
    level: 'Beginner',
    description: 'Learn the language of markets, operations, and decisions that shape growing companies.',
    lastStudied: '8 November',
    progress: 12,
    completedMaterials: 3,
    materialCount: 20,
    color: 'lilac',
    icon: '↗',
  },
]

export const mockCourseService: CourseService = {
  async listCourses() {
    return mockCourses.map((course) => ({ ...course }))
  },
  async createCourse(input) {
    const course: CourseSummary = {
      id: `personal-course-${nextCourseNumber++}`,
      title: input.title.trim(),
      subject: input.subject,
      level: input.level,
      description: input.description.trim() || `A focused ${input.subject.toLowerCase()} course for your study plan.`,
      lastStudied: 'Not started',
      progress: 0,
      completedMaterials: 0,
      materialCount: 0,
      color: input.subject === 'Deep Learning' ? 'forest' : input.subject === 'Statistics' ? 'coral' : input.subject === 'Biology' ? 'sage' : 'lilac',
      icon: '＋',
    }
    mockCourses.unshift(course)
    return { ...course }
  },
}
