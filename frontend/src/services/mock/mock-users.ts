import type { User } from '../../features/auth/types/auth.types'

export type MockUser = User & { password: string }

export const mockUsers: MockUser[] = [
  {
    id: 'user-alex',
    name: 'Alex Morgan',
    email: 'alex@example.com',
    password: 'study123',
    fieldOfStudy: 'Computer science',
    domain: 'Computer Science & IT',
    specialization: 'AI',
    level: "Bachelor's",
    preferredLanguage: 'English',
    targetRole: 'Machine learning engineer',
  },
]
