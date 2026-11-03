import type { DashboardCourse, PracticeConcept, Roadmap, StudySession, WeeklyActivity } from '../../types'

export const dashboardGreeting = {
  name: 'Maya',
  focus: 'asynchronous JavaScript',
  recommendation: 'Review promises and async/await for 20 minutes, then try the short practice set.',
}

export const dashboardCourses: DashboardCourse[] = [
  { id: 'react', title: 'Advanced React patterns', category: 'Computer science', progress: 68, lessons: 24, completed: 16, color: 'purple', icon: '⚛', lastActivity: 'Finished state management · today', nextLesson: 'Compound components' },
  { id: 'algorithms', title: 'Algorithms & complexity', category: 'Core CS', progress: 46, lessons: 20, completed: 9, color: 'green', icon: '⌁', lastActivity: 'Solved 3 graph problems · yesterday', nextLesson: 'Breadth-first search' },
  { id: 'python', title: 'Data science with Python', category: 'Elective', progress: 24, lessons: 32, completed: 8, color: 'orange', icon: '◈', lastActivity: 'Watched data cleaning lesson · Mon', nextLesson: 'Pandas indexing' },
]

export const conceptsToPractice: PracticeConcept[] = [
  { id: 'promises', title: 'Promise chaining', reason: 'You missed 2 questions in your last quiz.', course: 'Advanced React patterns', color: 'purple' },
  { id: 'recursion', title: 'Recursive base cases', reason: 'Your recent solution needed a hint.', course: 'Algorithms & complexity', color: 'green' },
  { id: 'joins', title: 'SQL joins', reason: 'It has been 12 days since you reviewed it.', course: 'Data science with Python', color: 'orange' },
]

export const recentSessions: StudySession[] = [
  { id: 'session-react-01', title: 'State management patterns', course: 'Advanced React patterns', duration: '32 min', completedAt: 'Today, 10:42 AM', score: '92%' },
  { id: 'session-algorithms-01', title: 'Graph traversal drills', course: 'Algorithms & complexity', duration: '48 min', completedAt: 'Yesterday, 4:18 PM', score: '84%' },
  { id: 'session-python-01', title: 'Cleaning messy datasets', course: 'Data science with Python', duration: '25 min', completedAt: 'Monday, 9:05 AM' },
]

export const weeklyActivity: WeeklyActivity[] = [
  { day: 'Mon', minutes: 45, label: '45m' },
  { day: 'Tue', minutes: 20, label: '20m' },
  { day: 'Wed', minutes: 65, label: '1h 5m' },
  { day: 'Thu', minutes: 35, label: '35m' },
  { day: 'Fri', minutes: 80, label: '1h 20m' },
  { day: 'Sat', minutes: 30, label: '30m' },
  { day: 'Sun', minutes: 0, label: 'Rest' },
]

export const dashboardRoadmap: Roadmap = {
  title: 'Frontend engineer',
  description: 'A practical path from JavaScript fluency to building production interfaces.',
  progress: 61,
  modules: 12,
  color: 'purple',
}
