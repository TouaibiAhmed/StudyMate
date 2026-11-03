import type { Activity, Course, Roadmap } from '../../types'
export const courses: Course[] = [
  { id: 'react', title: 'Advanced React patterns', category: 'Development', progress: 68, lessons: 24, completed: 16, color: 'purple', icon: '⚛' },
  { id: 'design', title: 'Product design foundations', category: 'Design', progress: 42, lessons: 18, completed: 8, color: 'orange', icon: '✦' },
  { id: 'data', title: 'Data science with Python', category: 'Data science', progress: 24, lessons: 32, completed: 8, color: 'blue', icon: '◈' },
]
export const activity: Activity[] = [
  { title: 'Completed “State management”', detail: 'Advanced React patterns', time: 'Today, 10:42 AM', icon: '✓', color: 'green' },
  { title: 'Scored 92% on quiz', detail: 'Product design foundations', time: 'Yesterday, 4:18 PM', icon: '★', color: 'yellow' },
  { title: 'Started a new course', detail: 'Data science with Python', time: 'Mon, 9:05 AM', icon: '＋', color: 'purple' },
]
export const roadmaps: Roadmap[] = [
  { title: 'Frontend engineer', description: 'Build modern, production-ready web experiences.', progress: 61, modules: 12, color: 'purple' },
  { title: 'Product designer', description: 'Master the craft of creating useful products.', progress: 28, modules: 9, color: 'orange' },
]
