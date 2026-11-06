export type User = {
  id: string
  name: string
  email: string
  fieldOfStudy?: string
  domain?: string
  specialization?: string
  level?: string
  preferredLanguage?: string
  targetRole?: string
}

export type LoginInput = {
  email: string
  password: string
}

export type SignupInput = {
  name: string
  email: string
  password: string
  level: string
  domain: string
  specialization: string
  preferredLanguage?: string
  targetRole?: string
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export type AuthContextType = {
  user?: User
  status: AuthStatus
  login(input: LoginInput): Promise<void>
  signup(input: SignupInput): Promise<void>
  logout(): Promise<void>
}
