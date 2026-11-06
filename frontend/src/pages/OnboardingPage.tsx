import { ArrowLeft, ArrowRight, Check, Compass, Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'

export type MockStudentProfile = {
  fieldOfStudy: string
  level: string
  preferredLanguage?: string
  targetRole?: string
  completedAt: string
}

const fieldSuggestions = ['Computer science', 'Data science', 'Biology', 'Business', 'Design']
const levels = ['High school student', 'University student', 'Graduate student', 'Working professional', 'Career changer']

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [fieldOfStudy, setFieldOfStudy] = useState('')
  const [level, setLevel] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState('')
  const [targetRole, setTargetRole] = useState('')
  const [error, setError] = useState('')

  function continueToNext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (step === 1 && !fieldOfStudy.trim()) {
      setError('Choose a field or tell us what you are studying.')
      return
    }
    if (step === 2 && !level) {
      setError('Choose the option that best describes your current level.')
      return
    }
    if (step < 3) {
      setStep((current) => current + 1)
      return
    }
    const profile: MockStudentProfile = {
      fieldOfStudy: fieldOfStudy.trim(),
      level,
      preferredLanguage: preferredLanguage.trim() || undefined,
      targetRole: targetRole.trim() || undefined,
      completedAt: new Date().toISOString(),
    }
    localStorage.setItem('studymate:student-profile', JSON.stringify(profile))
    navigate('/', { replace: true })
  }

  function goBack() {
    setError('')
    setStep((current) => Math.max(current - 1, 1))
  }

  return <main className="onboarding-page">
    <div className="onboarding-brand"><div className="brand-mark"><Sparkles size={17} /></div><span>Study<span className="brand-accent">mate</span></span></div>
    <div className="onboarding-layout">
      <aside className="onboarding-aside"><span className="eyebrow">A gentler start</span><h1>Make the studio feel like yours.</h1><p>A few details help us shape useful study paths. You can change your direction later.</p><div className="onboarding-aside-note"><Compass size={18} /><span>No account or commitment needed for this mock setup.</span></div></aside>
      <section className="onboarding-card" aria-labelledby="onboarding-title"><div className="onboarding-progress" aria-label={`Step ${step} of 3`}><div className="onboarding-progress-label"><span>Getting started</span><strong>0{step} / 03</strong></div><div className="onboarding-progress-track"><span style={{ width: `${(step / 3) * 100}%` }} /></div></div><form onSubmit={continueToNext}><div className="onboarding-heading"><span className="eyebrow">Step {step} of 3</span><h2 id="onboarding-title">{step === 1 ? 'What are you curious about?' : step === 2 ? 'Where are you in your journey?' : 'What would make this useful?'}</h2><p>{step === 1 ? 'Choose a suggestion or write your own field of study.' : step === 2 ? 'This helps us keep examples and pacing relevant.' : 'These details are optional and can guide your first roadmap.'}</p></div>{step === 1 && <FieldStep value={fieldOfStudy} onChange={setFieldOfStudy} />}{step === 2 && <LevelStep value={level} onChange={setLevel} />}{step === 3 && <PreferenceStep language={preferredLanguage} role={targetRole} onLanguageChange={setPreferredLanguage} onRoleChange={setTargetRole} />}{error && <p className="form-error onboarding-error" role="alert">{error}</p>}<div className="onboarding-actions">{step > 1 ? <Button type="button" variant="ghost" onClick={goBack}><ArrowLeft size={15} /> Back</Button> : <span />}{step === 3 && <button type="button" className="onboarding-skip" onClick={() => { setPreferredLanguage(''); setTargetRole('') }}>Skip optional fields</button>}<Button type="submit">{step === 3 ? 'Enter your studio' : 'Continue'} <ArrowRight size={15} /></Button></div></form><p className="onboarding-footnote">You can update these preferences anytime from your profile.</p></section>
    </div>
  </main>
}

function FieldStep({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="onboarding-fields"><div className="onboarding-suggestions" role="group" aria-label="Suggested fields">{fieldSuggestions.map((field) => <button type="button" className={value === field ? 'selected' : ''} onClick={() => onChange(field)} key={field}>{value === field && <Check size={14} />}{field}</button>)}</div><label>Or write your own field<input autoFocus value={value} onChange={(event) => onChange(event.target.value)} placeholder="e.g. Environmental engineering" /></label></div>
}

function LevelStep({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <fieldset className="onboarding-levels"><legend className="sr-only">Current education or professional level</legend>{levels.map((option) => <label className={value === option ? 'selected' : ''} key={option}><input type="radio" name="level" value={option} checked={value === option} onChange={(event) => onChange(event.target.value)} /><span>{option}</span>{value === option && <Check size={15} />}</label>)}</fieldset>
}

function PreferenceStep({ language, role, onLanguageChange, onRoleChange }: { language: string; role: string; onLanguageChange: (value: string) => void; onRoleChange: (value: string) => void }) {
  return <div className="onboarding-fields"><label>Preferred language <span className="optional-label">Optional</span><input autoFocus value={language} onChange={(event) => onLanguageChange(event.target.value)} placeholder="e.g. English, French, Arabic" /></label><label>Target role for a roadmap <span className="optional-label">Optional</span><input value={role} onChange={(event) => onRoleChange(event.target.value)} placeholder="e.g. Machine learning engineer" /></label></div>
}
