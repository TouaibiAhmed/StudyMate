import type { AuthService } from './auth.service'
import type { LoginInput, SignupInput, User } from '../types/auth.types'
import { ApiError, apiClient, setApiAccessToken } from '../../../services/http-client'
import type { AuthResponseDto, AuthUserDto, ProfileDto, RegisterRequestDto } from '../../../services/contracts/api/auth'

function extractToken(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const p = payload as Record<string, unknown>
  const token = p.access_token ?? p.accessToken ?? p.token
  return typeof token === 'string' ? token : undefined
}

export function mapDtoToUser(userDto?: AuthUserDto | null, profileDto?: ProfileDto | null): User {
  const name = userDto?.displayName || userDto?.display_name || userDto?.name || 'Student'
  const email = userDto?.email || ''
  const id = userDto?.id || profileDto?.userId || profileDto?.user_id || 'user-default'

  const fieldOfStudy = profileDto?.fieldOfStudy || profileDto?.field_of_study || profileDto?.specialization || undefined
  const domain = profileDto?.domain || undefined
  const specialization = profileDto?.specialization || undefined
  const level = profileDto?.level || profileDto?.academicLevel || profileDto?.academic_level || undefined
  const preferredLanguage = profileDto?.preferredLanguage || profileDto?.preferred_language || profileDto?.language || undefined
  const targetRole = profileDto?.targetRole || profileDto?.target_role || undefined

  return {
    id,
    name,
    email,
    fieldOfStudy,
    domain,
    specialization,
    level,
    preferredLanguage,
    targetRole,
  }
}

export const apiAuthService: AuthService = {
  async login(input: LoginInput): Promise<User> {
    const payload = {
      email: input.email.trim().toLowerCase(),
      password: input.password,
    }

    const response = await apiClient.post<AuthResponseDto>('/api/auth/login', payload)
    const token = extractToken(response.data)
    if (token) {
      setApiAccessToken(token)
    }

    const data = response.data
    let profile = data?.profile ?? null

    // If login returned user but no profile, retrieve it via GET /api/profile
    if (!profile) {
      try {
        const profileRes = await apiClient.get<ProfileDto>('/api/profile')
        profile = profileRes.data
      } catch {
        // Fallback: profile might not exist yet or request failed
      }
    }

    return mapDtoToUser(data?.user, profile)
  },

  async signup(input: SignupInput): Promise<User> {
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    const fieldOfStudy = input.specialization?.trim() || input.domain?.trim() || ''

    // The backend derives domainType from domain/specialization, so it is not sent.
    const payload: RegisterRequestDto = {
      email: input.email.trim().toLowerCase(),
      password: input.password,
      name: input.name.trim(),
      fieldOfStudy,
      domain: input.domain,
      specialization: input.specialization,
      level: input.level,
      preferredLanguage: input.preferredLanguage?.trim() || 'English',
      timeZone: userTimeZone,
      targetRole: input.targetRole?.trim() || null,
    }

    const response = await apiClient.post<AuthResponseDto>('/api/auth/register', payload)
    const token = extractToken(response.data)
    if (token) {
      setApiAccessToken(token)
    }

    const data = response.data
    let profile = data?.profile ?? null

    // If profile was not returned in registration response, attempt to fetch or patch it
    if (!profile) {
      try {
        const profileRes = await apiClient.get<ProfileDto>('/api/profile')
        profile = profileRes.data
      } catch {
        // Fallback to synthesizing profile from signup input
        profile = {
          userId: data?.user?.id,
          fieldOfStudy,
          domain: input.domain,
          specialization: input.specialization,
          level: input.level,
          preferredLanguage: input.preferredLanguage?.trim() || 'English',
          timeZone: userTimeZone,
          targetRole: input.targetRole?.trim() || null,
        }
      }
    }

    return mapDtoToUser(data?.user, profile)
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/api/auth/logout')
    } catch {
      // Ignore network or unsupported logout endpoint failures
    } finally {
      setApiAccessToken(undefined)
    }
  },

  async getCurrentUser(): Promise<User | undefined> {
    // Only a 401 means "not signed in". A server that is restarting (502/503) or a network blip
    // must not log the student out, so those are retried a few times first.
    for (const delay of [0, 600, 1500, 3000]) {
      if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay))
      try {
        return await loadCurrentUser()
      } catch (error) {
        if (error instanceof ApiError && (error.code === 'unauthorized' || error.code === 'forbidden')) return undefined
      }
    }
    return undefined
  },
}

async function loadCurrentUser(): Promise<User | undefined> {
  // /api/profile is authenticated: it answers only when the session cookie is valid.
  const response = await apiClient.get<ProfileDto & { user?: AuthUserDto; email?: string; displayName?: string; name?: string }>('/api/profile')
  const profile = response.data
  if (!profile) return undefined

  // If user info was nested or top-level in /api/profile
  const userDto: AuthUserDto = profile.user || {
    id: profile.userId || profile.user_id || 'user-current',
    email: profile.email || '',
    displayName: profile.displayName || profile.name || 'Student',
  }
  return mapDtoToUser(userDto, profile)
}
