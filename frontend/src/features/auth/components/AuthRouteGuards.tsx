import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { LoadingState } from '../../../components/feedback/LoadingState'
import { useAuth } from '../hooks/useAuth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <LoadingState label="Checking your mock session" />
  if (status === 'unauthenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

export function PublicRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status === 'loading') return <LoadingState label="Checking your mock session" />
  if (status === 'authenticated') return <Navigate to="/" replace />
  return children
}
