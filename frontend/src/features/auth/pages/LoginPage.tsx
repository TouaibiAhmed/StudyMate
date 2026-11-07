import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { LoginForm } from '../components/LoginForm'
import { useAuth } from '../hooks/useAuth'
import type { LoginInput } from '../types/auth.types'
import { useState } from 'react'

export function LoginPage() {
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  if (status === 'authenticated') return <Navigate to="/" replace />
  async function submit(input: LoginInput) {
    setSubmitting(true)
    setError('')
    try { await login(input); navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true }) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign in failed. Check your credentials and try again.') } finally { setSubmitting(false) }
  }
  return <AuthLayout eyebrow="Welcome back" title="Return to your study space." text="Sign in to pick up your courses, sessions, and progress."><LoginForm onSubmit={(input) => void submit(input)} submitting={submitting} error={error} /><p className="auth-switch">New to StudyMate? <Link to="/signup">Create a mock account</Link></p></AuthLayout>
}
