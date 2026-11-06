import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { SignupForm } from '../components/SignupForm'
import { useAuth } from '../hooks/useAuth'
import type { SignupInput } from '../types/auth.types'

export function SignupPage() {
  const { status, signup } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  if (status === 'authenticated') return <Navigate to="/" replace />
  async function submit(input: SignupInput) {
    setSubmitting(true)
    setError('')
    try { await signup(input); navigate('/', { replace: true }) } catch (reason) { setError(reason instanceof Error ? reason.message : 'The mock account could not be created. Try again.') } finally { setSubmitting(false) }
  }
  return <AuthLayout wide eyebrow="Start simply" title="Make room for better learning." text="Create a mock student account with just enough context to make your first study session feel relevant."><SignupForm onSubmit={(input) => void submit(input)} submitting={submitting} error={error} /><p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p></AuthLayout>
}
