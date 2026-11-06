import { ArrowRight, Check, Eye, EyeOff } from 'lucide-react'
import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import { academicLevels, studyDomains } from '../config/study-domains'
import type { SignupInput } from '../types/auth.types'

type Props = { onSubmit: (input: SignupInput) => void; submitting: boolean; error?: string }

export function SignupForm({ onSubmit, submitting, error }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [level, setLevel] = useState('')
  const [domain, setDomain] = useState('')
  const [specialization, setSpecialization] = useState('')
  const [customField, setCustomField] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState('English')
  const [targetRole, setTargetRole] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [validationError, setValidationError] = useState('')

  const selectedDomain = useMemo(() => studyDomains.find((item) => item.label === domain), [domain])
  const isCustomDomain = domain === 'Other'

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const field = isCustomDomain ? customField.trim() : specialization
    if (name.trim().length < 2) return setValidationError('Tell us your full name so the studio feels personal.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setValidationError('Enter a valid email address.')
    if (password.length < 6) return setValidationError('Use at least 6 characters for your password.')
    if (password !== confirmation) return setValidationError('Passwords do not match. Check both password fields.')
    if (!level || !domain || !field) return setValidationError('Choose your academic level, domain, and field of study.')
    setValidationError('')
    onSubmit({ name, email, password, level, domain, specialization: field, preferredLanguage, targetRole })
  }

  function updateDomain(value: string) {
    setDomain(value)
    setSpecialization('')
    setCustomField('')
    setValidationError('')
  }

  return <form className="auth-form signup-form" onSubmit={submit} noValidate aria-busy={submitting}>
    <div className="auth-form-section"><span className="auth-section-label">About you</span>
      <div className="auth-form-grid">
        <label htmlFor="signup-name">Full name<input id="signup-name" type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" /></label>
        <label htmlFor="signup-email">Email address<input id="signup-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      </div>
    </div>
    <div className="auth-form-section"><span className="auth-section-label">Secure your mock account</span>
      <div className="auth-form-grid">
        <div><label htmlFor="signup-password">Password</label><div className="auth-input-wrap"><input id="signup-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" /><button className="auth-input-action" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
        <div><label htmlFor="signup-confirmation">Confirm password</label><div className="auth-input-wrap"><input id="signup-confirmation" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repeat your password" /><button className="auth-input-action" type="button" onClick={() => setShowConfirmation((visible) => !visible)} aria-label={showConfirmation ? 'Hide confirmation password' : 'Show confirmation password'}>{showConfirmation ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
      </div>
    </div>
    <div className="auth-form-section"><span className="auth-section-label">Your learning context</span>
      <div className="auth-form-grid">
        <label htmlFor="signup-level">Academic level<select id="signup-level" value={level} onChange={(event) => setLevel(event.target.value)}><option value="">Select your level</option>{academicLevels.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label htmlFor="signup-domain">Main domain<select id="signup-domain" value={domain} onChange={(event) => updateDomain(event.target.value)}><option value="">Select a domain</option>{studyDomains.map((item) => <option key={item.label}>{item.label}</option>)}</select></label>
        <label htmlFor="signup-specialization">{isCustomDomain ? 'Specific field or specialization' : 'Specific field or specialization'}{isCustomDomain ? <input id="signup-specialization" type="text" value={customField} onChange={(event) => setCustomField(event.target.value)} placeholder="Tell us your field" /> : <select id="signup-specialization" value={specialization} onChange={(event) => setSpecialization(event.target.value)} disabled={!domain}><option value="">{domain ? 'Select a specialization' : 'Choose a domain first'}</option>{selectedDomain?.fields.map((item) => <option key={item}>{item}</option>)}</select>}</label>
        <label htmlFor="signup-language">Preferred language <span className="optional-label">Optional</span><input id="signup-language" type="text" value={preferredLanguage} onChange={(event) => setPreferredLanguage(event.target.value)} placeholder="English" /></label>
      </div>
      <label className="auth-wide-field" htmlFor="signup-target">Target role or learning goal <span className="optional-label">Optional</span><input id="signup-target" type="text" value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="e.g. Become a data analyst" /></label>
    </div>
    {(validationError || error) && <p className="form-error auth-feedback" role="alert">{validationError || error}</p>}
    <button className="button auth-submit" type="submit" disabled={submitting}>{submitting ? <><span className="auth-spinner" aria-hidden="true" /> Creating account…</> : <>Create my study space <ArrowRight size={16} /></>}</button>
    <p className="auth-demo-note"><Check size={13} aria-hidden="true" /> Mock account only. No password is stored in your browser.</p>
  </form>
}
