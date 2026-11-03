import type { StudyService } from '../contracts/study'
import { activity, courses, roadmaps } from './data'
export const mockStudyService: StudyService = {
  async getDashboard() { return { courses, activity, roadmaps } },
}
