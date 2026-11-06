export type StudentProfile = {
  fieldOfStudy: string
  domain?: string
  specialization?: string
  level: string
  preferredLanguage: string
  timeZone: string
  targetRole?: string
}

export type StudyPreferences = {
  hideStreaks: boolean
  sessionLength: '15 minutes' | '30 minutes' | '45 minutes' | '60 minutes'
  weeklyGoal: number
  reminderTime: string
}

export type SaveResponse = {
  success: boolean
  message: string
}

export interface PreferencesService {
  getProfile(): Promise<StudentProfile>
  saveProfile(profile: StudentProfile): Promise<SaveResponse>
  getStudyPreferences(): Promise<StudyPreferences>
  saveStudyPreferences(preferences: StudyPreferences): Promise<SaveResponse>
}
