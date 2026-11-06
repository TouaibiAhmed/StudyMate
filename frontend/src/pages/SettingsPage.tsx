import { CheckCircle2, Clock3, EyeOff, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/feedback/EmptyState'
import { LoadingState } from '../components/feedback/LoadingState'
import { preferencesService } from '../services/api-client'
import type { StudyPreferences } from '../services/contracts/preferences'

const sessionLengths: StudyPreferences['sessionLength'][] = ['15 minutes', '30 minutes', '45 minutes', '60 minutes']

export function SettingsPage() {
  const [settings, setSettings] = useState<StudyPreferences>()
  const [draft, setDraft] = useState<StudyPreferences>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ success: boolean; message: string }>()
  const [loadError, setLoadError] = useState('')
  function loadSettings(showLoading = true) {
    if (showLoading) { setLoading(true); setLoadError('') }
    void preferencesService.getStudyPreferences().then((value) => { setSettings(value); setDraft(value); setLoading(false) }).catch(() => { setLoadError('Your study preferences could not load. Try again from here.'); setLoading(false) })
  }
  useEffect(() => { let active = true; void preferencesService.getStudyPreferences().then((value) => { if (active) { setSettings(value); setDraft(value); setLoading(false) } }).catch(() => { if (active) { setLoadError('Your study preferences could not load. Try again from here.'); setLoading(false) } }); return () => { active = false } }, [])
  if (loading) return <LoadingState label="Loading your settings" />
  if (loadError || !draft || !settings) return <EmptyState title="Settings unavailable" text={loadError || 'Your study preferences are not available yet.'} action={<button className="button button-secondary"   onClick={() => loadSettings()}>Try again</button>} />
  const currentDraft = draft
  const currentSettings = settings
  function update<K extends keyof StudyPreferences>(key: K, value: StudyPreferences[K]) { setDraft((current) => current ? { ...current, [key]: value } : current); setFeedback(undefined) }
  function cancel() { setDraft(currentSettings); setFeedback(undefined) }
  async function save() { setSaving(true); const response = await preferencesService.saveStudyPreferences(currentDraft); setFeedback(response); if (response.success) setSettings(currentDraft); setSaving(false) }
  const changed = JSON.stringify(currentSettings) !== JSON.stringify(currentDraft)
  return <div className="page-stack settings-page"><div className="page-intro"><div><span className="eyebrow">Account</span><h2>Settings</h2><p>Shape how Study Partner fits into your study rhythm. These choices do not change course content or progress records.</p></div></div><section className="settings-grid"><div className="panel settings-card"><div className="settings-section-heading"><div className="settings-icon"><SlidersHorizontal size={18} /></div><div><span className="eyebrow">Study preferences</span><h3>Make sessions sustainable</h3></div></div><div className="settings-form"><label>Preferred session length<select value={currentDraft.sessionLength} onChange={(event) => update('sessionLength', event.target.value as StudyPreferences['sessionLength'])}>{sessionLengths.map((length) => <option key={length}>{length}</option>)}</select><small>Used as a suggestion when starting a new study session.</small></label><label>Weekly study goal<select value={currentDraft.weeklyGoal} onChange={(event) => update('weeklyGoal', Number(event.target.value))}>{[2, 3, 4, 5, 6, 7].map((goal) => <option key={goal} value={goal}>{goal} sessions per week</option>)}</select></label><label>Reminder time<input type="time" value={currentDraft.reminderTime} onChange={(event) => update('reminderTime', event.target.value)} /><small>Only a local preference in this mock experience.</small></label></div></div><div className="panel settings-card"><div className="settings-section-heading"><div className="settings-icon coral"><EyeOff size={18} /></div><div><span className="eyebrow">Visibility</span><h3>Keep motivation private</h3></div></div><label className="toggle-setting"><span><strong>Hide study streaks</strong><small>Remove streak indicators from the dashboard and summary views.</small></span><input type="checkbox" checked={currentDraft.hideStreaks} onChange={(event) => update('hideStreaks', event.target.checked)} /><i /></label><div className="settings-note"><Clock3 size={15} /><span>Your preferences are saved locally for this mock student.</span></div></div></section><div className="settings-actions settings-page-actions">{feedback && <span className={`save-feedback ${feedback.success ? 'success' : 'error'}`} role={feedback.success ? 'status' : 'alert'}>{feedback.success && <CheckCircle2 size={15} />}{feedback.message}</span>}<div><Button type="button" variant="ghost" onClick={cancel} disabled={!changed || saving}><RotateCcw size={14} /> Cancel</Button><Button type="button" onClick={() => void save()} disabled={!changed || saving}>{saving ? 'Saving…' : 'Save settings'}</Button></div></div></div>
}
