import { Camera, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState } from '../components/feedback/EmptyState'
import { LoadingState } from '../components/feedback/LoadingState'
import { Button } from '../components/ui/Button'
import { preferencesService } from '../services/api-client'
import type { StudentProfile } from '../services/contracts/preferences'

const levels = ['High school student', 'University student', 'Graduate student', 'Working professional', 'Career changer']
const timeZones = ['Europe/Paris', 'Europe/London', 'America/New_York', 'Asia/Dubai', 'Asia/Tokyo']

export function ProfilePage() {
  const [profile, setProfile] = useState<StudentProfile>()
  const [draft, setDraft] = useState<StudentProfile>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ success: boolean; message: string }>()
  const [fieldError, setFieldError] = useState('')
  const [loadError, setLoadError] = useState('')

  function loadProfile(showLoading = true) {
    if (showLoading) { setLoading(true); setLoadError('') }
    void preferencesService.getProfile().then((value) => { setProfile(value); setDraft(value); setLoading(false) }).catch(() => { setLoadError('Your profile could not load. Try again; local changes were not changed.'); setLoading(false) })
  }
  useEffect(() => { let active = true; void preferencesService.getProfile().then((value) => { if (active) { setProfile(value); setDraft(value); setLoading(false) } }).catch(() => { if (active) { setLoadError('Your profile could not load. Try again; local changes were not changed.'); setLoading(false) } }); return () => { active = false } }, [])

  if (loading) return <LoadingState label="Loading your profile" />
  if (loadError || !draft || !profile) return <EmptyState title="Profile unavailable" text={loadError || 'Your profile is not available yet.'} action={<button className="button button-secondary"   onClick={() => loadProfile()}>Try again</button>} />
  const currentDraft = draft
  const currentProfile = profile

  function update<K extends keyof StudentProfile>(key: K, value: StudentProfile[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current)
    setFeedback(undefined)
    setFieldError('')
  }

  function cancel() {
    setDraft(currentProfile)
    setFeedback(undefined)
    setFieldError('')
  }

  async function saveProfile() {
    if (!currentDraft.fieldOfStudy.trim() || !currentDraft.level || !currentDraft.preferredLanguage.trim() || !currentDraft.timeZone) {
      setFieldError('Field of study, level, language, and time zone are required.')
      return
    }
    setSaving(true)
    const response = await preferencesService.saveProfile(currentDraft)
    setFeedback(response)
    if (response.success) setProfile(currentDraft)
    setSaving(false)
  }

  const changed = JSON.stringify(currentProfile) !== JSON.stringify(currentDraft)
  return <div className="page-stack settings-page"><div className="page-intro"><div><span className="eyebrow">Account</span><h2>Your profile</h2><p>Keep your learning context current. These preferences stay separate from your courses and progress.</p></div></div><section className="panel profile-card"><div className="profile-header"><div className="profile-avatar">AM<button aria-label="Change avatar" type="button"><Camera size={15} /></button></div><div><h3>Alex Morgan</h3><p>Learning enthusiast · Mock student profile</p></div></div><div className="settings-form profile-settings-form"><label>Field of study<input value={currentDraft.fieldOfStudy} onChange={(event) => update('fieldOfStudy', event.target.value)} placeholder="e.g. Computer science" /></label><label>Current level<select value={currentDraft.level} onChange={(event) => update('level', event.target.value)}>{levels.map((level) => <option key={level}>{level}</option>)}</select></label><label>Preferred language<input value={currentDraft.preferredLanguage} onChange={(event) => update('preferredLanguage', event.target.value)} placeholder="e.g. English" /></label><label>Time zone<select value={currentDraft.timeZone} onChange={(event) => update('timeZone', event.target.value)}>{timeZones.map((zone) => <option key={zone}>{zone}</option>)}</select></label><label className="settings-full">Target role <span className="optional-label">Optional</span><input value={currentDraft.targetRole ?? ''} onChange={(event) => update('targetRole', event.target.value)} placeholder="e.g. Data analyst" /></label></div>{fieldError && <p className="form-error" role="alert">{fieldError}</p>}<SettingsActions changed={changed} saving={saving} feedback={feedback} onCancel={cancel} onSave={() => void saveProfile()} /></section><section className="settings-security"><ShieldCheck size={17} /><div><strong>Mock account privacy</strong><p>No password, authentication, or account deletion actions are connected in this frontend-only experience.</p></div></section></div>
}

function SettingsActions({ changed, saving, feedback, onCancel, onSave }: { changed: boolean; saving: boolean; feedback?: { success: boolean; message: string }; onCancel: () => void; onSave: () => void }) {
  return <div className="settings-actions">{feedback && <span className={`save-feedback ${feedback.success ? 'success' : 'error'}`} role={feedback.success ? 'status' : 'alert'}>{feedback.success && <CheckCircle2 size={15} />}{feedback.message}</span>}<div><Button type="button" variant="ghost" onClick={onCancel} disabled={!changed || saving}>Cancel</Button><Button type="button" onClick={onSave} disabled={!changed || saving}>{saving ? 'Saving…' : 'Save changes'}</Button></div></div>
}
