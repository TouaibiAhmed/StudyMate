import type { LoginInput, SignupInput, User } from '../types/auth.types'

export type AuthService = {
  login(input: LoginInput): Promise<User>
  signup(input: SignupInput): Promise<User>
  logout(): Promise<void>
  getCurrentUser(): Promise<User | undefined>
}
