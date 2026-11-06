import type { CourseDetail, CourseService, CourseSummary } from '../contracts/courses'

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
    domain: 'Computer Science & IT',
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
    domain: 'Computer Science & IT',
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
    domain: 'Health & Medicine',
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
    domain: 'Business',
  },
]

const courseDetails: Record<string, Pick<CourseDetail, 'concepts' | 'sessions'>> = {
  'deep-learning': {
    concepts: [
      { id: 'gradient-descent', title: 'Gradient descent', progress: 82, status: 'Strong' },
      { id: 'backpropagation', title: 'Backpropagation', progress: 56, status: 'In progress' },
      { id: 'regularization', title: 'Regularization', progress: 31, status: 'Needs review' },
      { id: 'cnn-architecture', title: 'CNN architecture', progress: 18, status: 'Needs review' },
    ],
    sessions: [
      { id: 'deep-session-1', title: 'Loss functions and intuition', date: 'Today, 9:20 AM', duration: '36 min', score: '90%' },
      { id: 'deep-session-2', title: 'Neural network foundations', date: 'Tuesday, 3:10 PM', duration: '42 min', score: '84%' },
      { id: 'deep-session-3', title: 'Tensor shapes practice', date: '10 November', duration: '24 min' },
    ],
  },
  statistics: {
    concepts: [
      { id: 'distributions', title: 'Probability distributions', progress: 74, status: 'Strong' },
      { id: 'hypothesis-testing', title: 'Hypothesis testing', progress: 47, status: 'In progress' },
      { id: 'confidence-intervals', title: 'Confidence intervals', progress: 26, status: 'Needs review' },
    ],
    sessions: [
      { id: 'statistics-session-1', title: 'Choosing the right test', date: 'Yesterday, 4:45 PM', duration: '31 min', score: '88%' },
    ],
  },
}

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
  async getCourse(courseId) {
    const course = mockCourses.find((item) => item.id === courseId)
    if (!course) return undefined
    const detail = courseDetails[courseId] ?? { concepts: [], sessions: [] }
    return { ...course, concepts: detail.concepts, sessions: detail.sessions }
  },
}
