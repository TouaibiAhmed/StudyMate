export type Course = { id: string; title: string; category: string; progress: number; lessons: number; completed: number; color: string; icon: string }
export type Activity = { title: string; detail: string; time: string; icon: string; color: string }
export type Roadmap = { title: string; description: string; progress: number; modules: number; color: string }
export type DashboardCourse = Course & { lastActivity: string; nextLesson: string }
export type PracticeConcept = { id: string; title: string; reason: string; course: string; color: string }
export type StudySession = { id: string; title: string; course: string; duration: string; completedAt: string; score?: string }
export type WeeklyActivity = { day: string; minutes: number; label: string }
