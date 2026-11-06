import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'
import type { LoginInput } from '../types/auth.types'

export function LoginForm({ onSubmit, submitting, error }: { onSubmit: (input: LoginInput) => void; submitting: boolean; error?: string }) {
  const [email, setEmail] = useState('alex@example.com')
  const [password, setPassword] = useState('study123')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [forgotMessage, setForgotMessage] = useState('')
  const [validationError, setValidationError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || !email.includes('@')) return setValidationError('Enter a valid email address.')
    if (password.length < 6) return setValidationError('Use at least 6 characters for the mock password.')
    setValidationError('')
    setForgotMessage('')
    onSubmit({ email, password })
  }

  return <form className="auth-form" onSubmit={submit} noValidate aria-busy={submitting}>
    <label htmlFor="login-email">Email address</label>
    <div className="auth-input-wrap"><Mail size={16} aria-hidden="true" /><input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setValidationError('') }} aria-invalid={Boolean(validationError && (!email.trim() || !email.includes('@')))} /></div>
    <div className="auth-password-heading"><label htmlFor="login-password">Password</label><button className="auth-text-button" type="button" onClick={() => setForgotMessage('Password recovery is not connected in this mock experience.')} disabled={submitting}>Forgot password?</button></div>
    <div className="auth-input-wrap"><LockKeyhole size={16} aria-hidden="true" /><input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setValidationError('') }} aria-invalid={Boolean(validationError && password.length < 6)} /><button className="auth-input-action" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
    <label className="auth-check"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /><span className="auth-check-mark"><Check size={12} /></span><span>Remember me <small>on this device</small></span></label>
    <p className="auth-demo-note">Demo account: alex@example.com · study123</p>
    {(validationError || error) && <p className="form-error auth-feedback" role="alert">{validationError || error}</p>}
    {forgotMessage && <p className="auth-info" role="status">{forgotMessage}</p>}
    <button className="button auth-submit" type="submit" disabled={submitting}>{submitting ? <><span className="auth-spinner" aria-hidden="true" /> Signing in…</> : <>Sign in <ArrowRight size={16} /></>}</button>
  </form>
}
