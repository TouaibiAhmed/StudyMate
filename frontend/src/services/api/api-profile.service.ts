import type { PreferencesService, SaveResponse, StudentProfile, StudyPreferences } from '../contracts/preferences'
import type { ProfileDto, UpdateProfileRequestDto } from '../contracts/api/auth'
import { apiClient } from '../http-client'
import { mapDomainToDomainType } from '../../features/auth/services/api-auth.service'

const LOCAL_PREFS_KEY = 'studymate:api-study-preferences'

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

export const apiProfileService: PreferencesService = {
  async getProfile(): Promise<StudentProfile> {
    const response = await apiClient.get<ProfileDto>('/api/profile')
    return mapDtoToProfile(response.data)
  },

  async saveProfile(profile: StudentProfile): Promise<SaveResponse> {
    const domainType = mapDomainToDomainType(profile.domain)
    const payload: UpdateProfileRequestDto = {
      field_of_study: profile.fieldOfStudy.trim(),
      fieldOfStudy: profile.fieldOfStudy.trim(),
      domain: profile.domain || null,
      domain_type: domainType,
      domainType,
      specialization: profile.specialization || null,
      level: profile.level,
      academic_level: profile.level,
      language: profile.preferredLanguage.trim(),
      preferred_language: profile.preferredLanguage.trim(),
      preferredLanguage: profile.preferredLanguage.trim(),
      time_zone: profile.timeZone,
      timeZone: profile.timeZone,
      target_role: profile.targetRole?.trim() || null,
      targetRole: profile.targetRole?.trim() || null,
    }

    const response = await apiClient.patch<ProfileDto>('/api/profile', payload)
    
    // Notify shell & other listeners that profile has updated
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('studymate:profile-updated'))
    }

    return {
      success: Boolean(response.data),
      message: 'Your profile was saved.',
    }
  },

  async getStudyPreferences(): Promise<StudyPreferences> {
    let hideStreaks = false
    try {
      const response = await apiClient.get<ProfileDto>('/api/profile')
      const dto = response.data
      if (dto.showStreaks === false || dto.show_streaks === false) {
        hideStreaks = true
      }
    } catch {
      // Continue with default
    }

    let cached: Partial<StudyPreferences> = {}
    try {
      const stored = localStorage.getItem(LOCAL_PREFS_KEY)
      if (stored) cached = JSON.parse(stored) as Partial<StudyPreferences>
    } catch {
      // Ignore storage errors
    }

    return {
      hideStreaks,
      sessionLength: cached.sessionLength || '30 minutes',
      weeklyGoal: cached.weeklyGoal || 4,
      reminderTime: cached.reminderTime || '18:00',
    }
  },

  async saveStudyPreferences(preferences: StudyPreferences): Promise<SaveResponse> {
    try {
      await apiClient.patch<ProfileDto>('/api/profile', {
        show_streaks: !preferences.hideStreaks,
        showStreaks: !preferences.hideStreaks,
      })
    } catch {
      // Keep going to persist UI preference locally
    }

    try {
      localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(preferences))
    } catch {
      // Ignore storage errors
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('studymate:profile-updated'))
    }

    return {
      success: true,
      message: 'Your study preferences were saved.',
    }
  },
}

export const apiPreferencesService = apiProfileService
