import type { PreferencesService, SaveResponse, StudentProfile, StudyPreferences } from '../contracts/preferences'

const profileDefaults: StudentProfile = {
  fieldOfStudy: 'Computer science',
  domain: 'Computer Science & IT',
  specialization: 'AI',
  level: 'University student',
  preferredLanguage: 'English',
  timeZone: 'Europe/Paris',
  targetRole: 'Machine learning engineer',
}

const preferenceDefaults: StudyPreferences = {
  hideStreaks: false,
  sessionLength: '30 minutes',
  weeklyGoal: 4,
  reminderTime: '18:00',
}

function read<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? { ...fallback, ...JSON.parse(stored) } : { ...fallback }
  } catch {
    return { ...fallback }
  }
}

function save<T>(key: string, value: T): SaveResponse {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return { success: true, message: 'Your changes were saved.' }
  } catch {
    return { success: false, message: 'We could not save those changes locally. Try again.' }
  }
}

function validateProfile(profile: StudentProfile): SaveResponse | undefined {
  if (!profile.fieldOfStudy.trim() || !profile.level || !profile.preferredLanguage.trim() || !profile.timeZone) {
    return { success: false, message: 'Complete the required profile fields before saving.' }
  }
}

export const mockPreferencesService: PreferencesService = {
  async getProfile() {
    const onboarding = read<Partial<StudentProfile>>('studymate:student-profile', {})
    return {
      ...read('studymate:profile-preferences', profileDefaults),
      fieldOfStudy: onboarding.fieldOfStudy || profileDefaults.fieldOfStudy,
      domain: onboarding.domain || profileDefaults.domain,
      specialization: onboarding.specialization || profileDefaults.specialization,
      level: onboarding.level || profileDefaults.level,
      preferredLanguage: onboarding.preferredLanguage || profileDefaults.preferredLanguage,
      targetRole: onboarding.targetRole || profileDefaults.targetRole,
    }
  },
  async saveProfile(profile) {
    const validation = validateProfile(profile)
    if (validation) return validation
    const response = save('studymate:profile-preferences', profile)
    if (response.success) window.dispatchEvent(new CustomEvent('studymate:profile-updated'))
    return response
  },
  async getStudyPreferences() {
    return read('studymate:study-preferences', preferenceDefaults)
  },
  async saveStudyPreferences(preferences) {
    return save('studymate:study-preferences', preferences)
  },
}
