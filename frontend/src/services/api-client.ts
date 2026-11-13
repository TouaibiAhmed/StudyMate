import { mockStudyService } from './mock/study-service'
import { mockDashboardService } from './mock/dashboard-service'
import { mockCourseService } from './mock/courses-service'
import { mockDocumentService } from './mock/documents-service'
import { mockStudySessionService } from './mock/sessions-service'
import { mockProgressService } from './mock/progress-service'
import { mockRoadmapService } from './mock/roadmaps-service'
import { mockExamService } from './mock/exams-service'
import { mockPreferencesService } from './mock/preferences-service'
import { mockLearningRecordService } from './mock/learning-records'
import { mockAuthService } from './mock/mock-auth.service'
import { mockChatService } from './mock/chat-service'
import { mockStudyToolsService } from './mock/study-tools-service'
import { mockCatalogService } from './mock/catalog-service'
import { apiCatalogService } from './api/api-catalog.service'
import { apiAuthService, apiProfileService, apiChatService, apiCourseService, apiDashboardService, apiDocumentService, apiExamService, apiPreferencesService, apiProgressService, apiRoadmapService, apiStudySessionService, apiStudyToolsService } from './api/api-services'
import { invalidateDashboard, getDashboardVersion } from './api/api-dashboard.service'
import { selectService } from './service-mode'
export { ApiClient, ApiError, apiClient } from './http-client'
export type { ApiClientOptions, ApiErrorCode, ApiErrorPayload, ApiRequestOptions, ApiResponse } from './http-client'
export const studyService = mockStudyService
export const dashboardService = selectService('dashboard', mockDashboardService, apiDashboardService)
export const courseService = selectService('courses', mockCourseService, apiCourseService)
export const documentService = selectService('documents', mockDocumentService, apiDocumentService)
export const studySessionService = selectService('study-sessions', mockStudySessionService, apiStudySessionService)
export const progressService = selectService('progress', mockProgressService, apiProgressService)
export const roadmapService = selectService('roadmaps', mockRoadmapService, apiRoadmapService)
export const examService = selectService('exams', mockExamService, apiExamService)
export const preferencesService = selectService('profile', mockPreferencesService, apiPreferencesService)
export const profileService = preferencesService
export { apiAuthService, apiPreferencesService, apiProfileService, apiCourseService, apiDocumentService, apiStudySessionService, apiProgressService, apiRoadmapService }
export { mockAuthService, mockPreferencesService, mockCourseService, mockDocumentService, mockStudySessionService, mockProgressService, mockRoadmapService }
export const learningRecordService = mockLearningRecordService
export const authService = selectService('auth', mockAuthService, apiAuthService)
export const chatService = selectService('chat', mockChatService, apiChatService)
export const studyToolsService = selectService('study-tools', mockStudyToolsService, apiStudyToolsService)
export const catalogService = selectService('catalog', mockCatalogService, apiCatalogService)
export { invalidateDashboard, getDashboardVersion }
