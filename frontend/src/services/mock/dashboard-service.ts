import type { DashboardService } from '../contracts/dashboard'
import { conceptsToPractice, dashboardCourses, dashboardGreeting, dashboardRoadmap, recentSessions, weeklyActivity } from './dashboard-data'

export const mockDashboardService: DashboardService = {
  async getDashboard() {
    return {
      greeting: dashboardGreeting,
      courses: dashboardCourses,
      concepts: conceptsToPractice,
      sessions: recentSessions,
      weeklyActivity,
      roadmap: dashboardRoadmap,
      isFirstTime: false,
    }
  },
}
