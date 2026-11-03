import type { Activity, Course, Roadmap } from '../../types'
export type DashboardData = { courses: Course[]; activity: Activity[]; roadmaps: Roadmap[] }
export interface StudyService { getDashboard(): Promise<DashboardData> }
