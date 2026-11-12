import type { PreferencesService, SaveResponse, StudentProfile, StudyPreferences } from '../contracts/preferences'
import type { ProfileDto, UpdateProfileRequestDto } from '../contracts/api/auth'
import { apiClient } from '../http-client'
import { classifyAiError } from '../ai-error'

function mapDtoToProfile(dto: ProfileDto): StudentProfile {
  return {
    fieldOfStudy: dto.fieldOfStudy || dto.field_of_study || dto.specialization || '',
    domain: dto.domain ?? undefined,
    specialization: dto.specialization ?? undefined,
    level: dto.level || dto.academicLevel || dto.academic_level || 'University student',
    preferredLanguage: dto.preferredLanguage || dto.preferred_language || dto.language || 'English',
    timeZone: dto.timeZone || dto.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    targetRole: dto.targetRole || dto.target_role || undefined,
  }
}

function notifyProfileUpdated() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('studymate:profile-updated'))
}

function failure(error: unknown, fallback: string): SaveResponse {
  return { success: false, message: classifyAiError(error).userMessage || fallback }
}

export const apiProfileService: PreferencesService = {
  async getProfile(): Promise<StudentProfile> {
    const response = await apiClient.get<ProfileDto>('/api/profile')
    return mapDtoToProfile(response.data)
  },

  async saveProfile(profile: StudentProfile): Promise<SaveResponse> {
    // The backend recomputes domainType from domain/specialization/fieldOfStudy.
    const payload: UpdateProfileRequestDto = {
      fieldOfStudy: profile.fieldOfStudy.trim(),
      domain: profile.domain || null,
      specialization: profile.specialization || null,
      level: profile.level,
      preferredLanguage: profile.preferredLanguage.trim() || 'English',
      timeZone: profile.timeZone,
      targetRole: profile.targetRole?.trim() || null,
    }
    try {
      await apiClient.patch<ProfileDto>('/api/profile', payload)
    } catch (error) {
      return failure(error, 'Your profile could not be saved. Try again.')
    }
    notifyProfileUpdated()
    return { success: true, message: 'Your profile was saved.' }
  },

  async getStudyPreferences(): Promise<StudyPreferences> {
    const response = await apiClient.get<StudyPreferences>('/api/preferences')
    return response.data
  },

  async saveStudyPreferences(preferences: StudyPreferences): Promise<SaveResponse> {
    try {
      await apiClient.put<StudyPreferences>('/api/preferences', preferences)
    } catch (error) {
      return failure(error, 'Your study preferences could not be saved. Try again.')
    }
    notifyProfileUpdated()
    return { success: true, message: 'Your study preferences were saved.' }
  },
}

export const apiPreferencesService = apiProfileService
