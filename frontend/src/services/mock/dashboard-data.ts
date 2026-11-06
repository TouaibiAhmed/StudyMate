import type { DashboardCourse, PracticeConcept, Roadmap, StudySession, WeeklyActivity } from '../../types'

export const dashboardGreeting = {
  name: 'Alex',
  focus: 'deep learning',
  recommendation: 'Review loss functions for 20 minutes, then try the short practice set.',
}

export const dashboardCourses: DashboardCourse[] = [
  { id: 'deep-learning', title: 'Deep Learning', category: 'Deep Learning', progress: 64, lessons: 25, completed: 16, color: 'purple', icon: '∿', lastActivity: 'Finished loss functions · today', nextLesson: 'Backpropagation' },
  { id: 'statistics', title: 'Statistics for Research', category: 'Statistics', progress: 38, lessons: 24, completed: 9, color: 'green', icon: 'σ', lastActivity: 'Reviewed hypothesis testing · yesterday', nextLesson: 'Confidence intervals' },
  { id: 'biology', title: 'Cell Biology', category: 'Biology', progress: 21, lessons: 18, completed: 5, color: 'orange', icon: '✣', lastActivity: 'Watched cell signaling lesson · Mon', nextLesson: 'Cell membranes' },
]

export const conceptsToPractice: PracticeConcept[] = [
  { id: 'backpropagation', title: 'Backpropagation', reason: 'Your last explanation needs a clearer chain-rule connection.', course: 'Deep Learning', color: 'purple' },
  { id: 'hypothesis-testing', title: 'Hypothesis testing', reason: 'The decision rule still needs practice.', course: 'Statistics for Research', color: 'green' },
  { id: 'cell-signaling', title: 'Cell signaling', reason: 'Your analogy needs more mechanism detail.', course: 'Cell Biology', color: 'orange' },
]

export const recentSessions: StudySession[] = [
  { id: 'deep-session-1', title: 'Loss functions and intuition', course: 'Deep Learning', duration: '36 min', completedAt: 'Today, 9:20 AM', score: '90%' },
  { id: 'statistics-session-1', title: 'Choosing the right test', course: 'Statistics for Research', duration: '31 min', completedAt: 'Yesterday, 4:45 PM', score: '88%' },
  { id: 'session-general-01', title: 'Explaining complex ideas', course: 'Independent study', duration: '25 min', completedAt: 'Monday, 9:05 AM' },
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
  title: 'Data Analyst',
  description: 'A practical path from messy questions to decision-ready insights.',
  progress: 42,
  modules: 8,
  color: 'purple',
}
