import type { AuthService } from './auth.service'
import type { LoginInput, SignupInput, User } from '../types/auth.types'
import { apiClient, setApiAccessToken } from '../../../services/http-client'
import type { AuthResponseDto, AuthUserDto, ProfileDto, RegisterRequestDto } from '../../../services/contracts/api/auth'

export function mapDomainToDomainType(domain?: string | null): string {
  if (!domain) return 'conceptual'
  const d = domain.toLowerCase()
  if (d.includes('computer') || d.includes('code') || d.includes('software') || d.includes('data science') || d.includes('programming')) {
    return 'code-based'
  }
  if (d.includes('math') || d.includes('physics') || d.includes('engineering') || d.includes('statistics') || d.includes('finance')) {
    return 'quantitative'
  }
  if (d.includes('literature') || d.includes('philosophy') || d.includes('social science') || d.includes('politics') || d.includes('law')) {
    return 'argumentative'
  }
  if (d.includes('language')) {
    return 'language'
  }
  return 'conceptual'
}

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
    try {
      // In FastAPI /api/profile is authenticated. If user is signed in, profile returns.
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
    } catch (error) {
      // 401 unauthenticated or not logged in
      return undefined
    }
  },
}
