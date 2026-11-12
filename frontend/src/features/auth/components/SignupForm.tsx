import { ArrowLeft, ArrowRight, Check, Eye, EyeOff } from 'lucide-react'
import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import { getDataMode } from '../../../services/service-mode'
import { academicLevels, studyDomains } from '../config/study-domains'
import type { SignupInput } from '../types/auth.types'

const isMockAuth = getDataMode('auth') === 'mock'

type Props = { onSubmit: (input: SignupInput) => void; submitting: boolean; error?: string }

export function SignupForm({ onSubmit, submitting, error }: Props) {
  const [step, setStep] = useState(1)
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
  const field = domain === 'Other' ? customField.trim() : specialization

  function validateCurrentStep() {
    if (step === 1) {
      if (name.trim().length < 2) return 'Tell us your first name so the studio feels personal.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.'
      if (password.length < 8) return 'Use at least 8 characters for your password.'
      if (password !== confirmation) return 'Passwords do not match. Check both password fields.'
    }
    if (step === 2 && (!level || !domain || !field)) return 'Choose your academic level, domain, and field of study.'
    return ''
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextError = validateCurrentStep()
    if (nextError) {
      setValidationError(nextError)
      return
    }
    setValidationError('')
    if (step < 3) {
      setStep((current) => current + 1)
      return
    }
    onSubmit({ name, email, password, level, domain, specialization: field, preferredLanguage, targetRole })
  }

  function goBack() {
    setValidationError('')
    setStep((current) => Math.max(1, current - 1))
  }

  function updateDomain(value: string) {
    setDomain(value)
    setSpecialization('')
    setCustomField('')
    setValidationError('')
  }

  return <form className="auth-form signup-form" onSubmit={submit} noValidate aria-busy={submitting}>
    <div className="signup-progress" aria-label={`Signup step ${step} of 3`}>
      <div><span>Set up your study space</span><strong>0{step} / 03</strong></div>
      <div className="signup-progress-track"><span style={{ width: `${(step / 3) * 100}%` }} /></div>
    </div>

    {step === 1 && <section className="auth-form-section" aria-labelledby="signup-step-title">
      <span className="auth-section-label">Step 1 · Your account</span>
      <h3 id="signup-step-title" className="signup-step-title">Start with the basics.</h3>
      <label htmlFor="signup-name">First name<input id="signup-name" type="text" autoComplete="given-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex" /></label>
      <label htmlFor="signup-email">Email address<input id="signup-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      <div className="auth-form-grid">
        <div><label htmlFor="signup-password">Password</label><div className="auth-input-wrap"><input id="signup-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /><button className="auth-input-action" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
        <div><label htmlFor="signup-confirmation">Confirm password</label><div className="auth-input-wrap"><input id="signup-confirmation" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repeat password" /><button className="auth-input-action" type="button" onClick={() => setShowConfirmation((visible) => !visible)} aria-label={showConfirmation ? 'Hide confirmation password' : 'Show confirmation password'}>{showConfirmation ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
      </div>
    </section>}

    {step === 2 && <section className="auth-form-section" aria-labelledby="signup-step-title">
      <span className="auth-section-label">Step 2 · Your learning context</span>
      <h3 id="signup-step-title" className="signup-step-title">Help us make recommendations relevant.</h3>
      <label htmlFor="signup-level">Academic level<select id="signup-level" value={level} onChange={(event) => setLevel(event.target.value)}><option value="">Select your level</option>{academicLevels.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label htmlFor="signup-domain">Main domain<select id="signup-domain" value={domain} onChange={(event) => updateDomain(event.target.value)}><option value="">Select a domain</option>{studyDomains.map((item) => <option key={item.label}>{item.label}</option>)}</select></label>
      <label htmlFor="signup-specialization">Specific field or specialization{domain === 'Other' ? <input id="signup-specialization" type="text" value={customField} onChange={(event) => setCustomField(event.target.value)} placeholder="Tell us your field" /> : <select id="signup-specialization" value={specialization} onChange={(event) => setSpecialization(event.target.value)} disabled={!domain}><option value="">{domain ? 'Select a specialization' : 'Choose a domain first'}</option>{selectedDomain?.fields.map((item) => <option key={item}>{item}</option>)}</select>}</label>
    </section>}

    {step === 3 && <section className="auth-form-section" aria-labelledby="signup-step-title">
      <span className="auth-section-label">Step 3 · Make it yours</span>
      <h3 id="signup-step-title" className="signup-step-title">A couple of optional details.</h3>
      <label htmlFor="signup-language">Preferred language <span className="optional-label">Optional</span><input id="signup-language" type="text" value={preferredLanguage} onChange={(event) => setPreferredLanguage(event.target.value)} placeholder="English" /></label>
      <label htmlFor="signup-target">Target role or learning goal <span className="optional-label">Optional</span><input id="signup-target" type="text" value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="e.g. Become a data analyst" /></label>
      <p className="auth-demo-note"><Check size={13} aria-hidden="true" /> You can update these preferences anytime from your profile.</p>
    </section>}

    {(validationError || error) && <p className="form-error auth-feedback" role="alert">{validationError || error}</p>}
    <div className="signup-actions">
      {step > 1 ? <button className="button button-ghost" type="button" onClick={goBack} disabled={submitting}><ArrowLeft size={15} /> Back</button> : <span />}
      <button className="button auth-submit" type="submit" disabled={submitting}>{submitting ? <><span className="auth-spinner" aria-hidden="true" /> Creating account…</> : <>{step === 3 ? 'Create my study space' : 'Continue'} <ArrowRight size={16} /></>}</button>
    </div>
    {isMockAuth && <p className="auth-demo-note">Mock account only. No password is stored in your browser.</p>}
  </form>
}
