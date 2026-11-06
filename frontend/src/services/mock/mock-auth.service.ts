import type { AuthService } from '../../features/auth/services/auth.service'
import type { LoginInput, SignupInput, User } from '../../features/auth/types/auth.types'
import { mockUsers, type MockUser } from './mock-users'

const sessionKey = 'studymate:mock-auth-user'
const userProfileKey = 'studymate:mock-auth-profile'
let nextUserNumber = 1

function toUser(user: MockUser): User {
  const { password: _password, ...safeUser } = user
  return safeUser
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function persistSafeUser(user: User) {
  localStorage.setItem(userProfileKey, JSON.stringify(user))
}

export const mockAuthService: AuthService = {
  async login(input: LoginInput) {
    const user = mockUsers.find((candidate) => candidate.email === normalizeEmail(input.email) && candidate.password === input.password)
    if (!user) throw new Error('The email or password did not match our demo account.')
    localStorage.setItem(sessionKey, user.id)
    const safeUser = toUser(user)
    persistSafeUser(safeUser)
    return safeUser
  },

  async signup(input: SignupInput) {
    const email = normalizeEmail(input.email)
    if (mockUsers.some((user) => user.email === email)) throw new Error('An account with that email already exists. Try signing in instead.')
    const user: MockUser = {
      id: `mock-user-${nextUserNumber++}`,
      name: input.name.trim(),
      email,
      password: input.password,
      fieldOfStudy: input.specialization,
      domain: input.domain,
      specialization: input.specialization,
      level: input.level,
      preferredLanguage: input.preferredLanguage || 'English',
      targetRole: input.targetRole?.trim() || undefined,
    }
    mockUsers.push(user)
    localStorage.setItem(sessionKey, user.id)
    localStorage.setItem('studymate:student-profile', JSON.stringify({
      fieldOfStudy: input.specialization,
      domain: input.domain,
      specialization: input.specialization,
      level: input.level,
      preferredLanguage: input.preferredLanguage?.trim() || 'English',
      targetRole: input.targetRole?.trim() || undefined,
    }))
    const safeUser = toUser(user)
    persistSafeUser(safeUser)
    return safeUser
  },

  async logout() {
    localStorage.removeItem(sessionKey)
    localStorage.removeItem(userProfileKey)
  },

  async getCurrentUser() {
    const userId = localStorage.getItem(sessionKey)
    const user = userId ? mockUsers.find((candidate) => candidate.id === userId) : undefined
    if (user) return toUser(user)
    try {
      const persisted = localStorage.getItem(userProfileKey)
      const safeUser = persisted ? JSON.parse(persisted) as User : undefined
      return safeUser?.id === userId ? safeUser : undefined
    } catch {
      return undefined
    }
  },
}
