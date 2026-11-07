import type { ApiId, IsoTimestamp } from './common'

export type AuthUserDto = {
  id: ApiId
  email: string
  displayName?: string
  display_name?: string
  name?: string
  createdAt?: IsoTimestamp
  created_at?: IsoTimestamp
  updatedAt?: IsoTimestamp
  updated_at?: IsoTimestamp
}

export type ProfileDto = {
  id?: ApiId
  userId?: ApiId
  user_id?: ApiId
  fieldOfStudy?: string
  field_of_study?: string
  domain?: string | null
  domainType?: string | null
  domain_type?: string | null
  specialization?: string | null
  level?: string
  academicLevel?: string
  academic_level?: string
  language?: string
  preferredLanguage?: string
  preferred_language?: string
  timeZone?: string
  time_zone?: string
  targetRole?: string | null
  target_role?: string | null
  showStreaks?: boolean
  show_streaks?: boolean
  createdAt?: IsoTimestamp
  created_at?: IsoTimestamp
  updatedAt?: IsoTimestamp
  updated_at?: IsoTimestamp
}

export type LoginRequestDto = {
  email: string
  password: string
}

export type RegisterRequestDto = {
  email: string
  password: string
  name?: string
  display_name?: string
  field_of_study?: string
  fieldOfStudy?: string
  domain?: string
  domain_type?: string
  domainType?: string
  specialization?: string
  level?: string
  academic_level?: string
  language?: string
  preferred_language?: string
  preferredLanguage?: string
  time_zone?: string
  timeZone?: string
  target_role?: string | null
  targetRole?: string | null
  show_streaks?: boolean
  showStreaks?: boolean
}

export type AuthResponseDto = {
  access_token?: string
  accessToken?: string
  token?: string
  token_type?: string
  tokenType?: string
  user?: AuthUserDto
  profile?: ProfileDto | null
  expires_at?: IsoTimestamp | null
  expiresAt?: IsoTimestamp | null
}

export type UpdateProfileRequestDto = {
  field_of_study?: string
  fieldOfStudy?: string
  domain?: string | null
  domain_type?: string | null
  domainType?: string | null
  specialization?: string | null
  level?: string
  academic_level?: string
  language?: string
  preferred_language?: string
  preferredLanguage?: string
  time_zone?: string
  timeZone?: string
  target_role?: string | null
  targetRole?: string | null
  show_streaks?: boolean
  showStreaks?: boolean
}
