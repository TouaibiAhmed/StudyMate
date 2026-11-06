import { useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { mockAuthService } from '../../services/mock/mock-auth.service'
import { AuthContext } from './hooks/useAuth'
import type { AuthStatus, LoginInput, SignupInput, User } from './types/auth.types'

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User>()
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    void mockAuthService.getCurrentUser().then((currentUser) => {
      setUser(currentUser)
      setStatus(currentUser ? 'authenticated' : 'unauthenticated')
    }).catch(() => setStatus('unauthenticated'))
  }, [])

  const value = useMemo(() => ({
    user,
    status,
    async login(input: LoginInput) {
      const signedInUser = await mockAuthService.login(input)
      setUser(signedInUser)
      setStatus('authenticated')
    },
    async signup(input: SignupInput) {
      const signedUpUser = await mockAuthService.signup(input)
      setUser(signedUpUser)
      setStatus('authenticated')
    },
    async logout() {
      await mockAuthService.logout()
      setUser(undefined)
      setStatus('unauthenticated')
    },
  }), [status, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
