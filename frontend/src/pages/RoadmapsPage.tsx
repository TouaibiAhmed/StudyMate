import { ArrowRight, Loader2, Map, Plus, Search, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { ProgressBar } from '../components/ui/ProgressBar'
import { roadmapService } from '../services/api-client'
import type { CreateRoadmapInput, RoadmapCategory, RoadmapSummary } from '../services/contracts/roadmaps'
import { preferencesService } from '../services/api-client'
import type { StudentProfile } from '../services/contracts/preferences'
import { isRoadmapRelevant, prioritizeRoadmaps } from '../services/domain-personalization'
import { classifyAiError } from '../services/ai-error'
import { ApiError } from '../services/http-client'
import { getDataMode } from '../services/service-mode'

const categories: Array<'All' | RoadmapCategory> = ['All', 'Data', 'Engineering', 'Machine learning', 'Business']

export function RoadmapsPage() {
  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'All' | RoadmapCategory>('All')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [profile, setProfile] = useState<StudentProfile>()
  const [recommendedOnly, setRecommendedOnly] = useState(false)
  const [creating, setCreating] = useState(false)

  // Generated roadmaps are written in the background: refresh the library until they are done.
  const generating = roadmaps.some((roadmap) => roadmap.status === 'generating')
  useEffect(() => {
    if (!generating) return
    const timer = window.setInterval(() => { void roadmapService.listRoadmaps().then(setRoadmaps).catch(() => undefined) }, 5000)
    return () => window.clearInterval(timer)
  }, [generating])

  function loadRoadmaps(showLoading = true) {
    if (showLoading) { setLoading(true); setError('') }
    void roadmapService.listRoadmaps().then((items) => { setRoadmaps(items); setLoading(false) }).catch(() => { setError('We could not load the roadmap library. Try again from here.'); setLoading(false) })
  }
  useEffect(() => { let active = true; void Promise.all([roadmapService.listRoadmaps(), preferencesService.getProfile()]).then(([items, currentProfile]) => { if (active) { setRoadmaps(items); setProfile(currentProfile); setRecommendedOnly(Boolean(currentProfile.domain)); setLoading(false) } }).catch(() => { if (active) { setError('We could not load the roadmap library. Try again from here.'); setLoading(false) } }); return () => { active = false } }, [])

  const orderedRoadmaps = useMemo(() => prioritizeRoadmaps(roadmaps, profile), [roadmaps, profile])
  const visible = useMemo(() => orderedRoadmaps.filter((roadmap) => {
    const matchesQuery = `${roadmap.role} ${roadmap.description} ${roadmap.category}`.toLowerCase().includes(query.trim().toLowerCase())
    return matchesQuery && (category === 'All' || roadmap.category === category) && (!recommendedOnly || roadmap.source === 'AI-generated' || isRoadmapRelevant(roadmap, profile))
  }), [category, query, orderedRoadmaps, recommendedOnly, profile])

  function createRoadmap(input: CreateRoadmapInput) {
    setActionError('')
    setCreating(true)
    void roadmapService.createRoadmap(input).then((roadmap) => {
      setRoadmaps((current) => [roadmap, ...current.filter((item) => item.id !== roadmap.id)])
      setDialogOpen(false)
    }).catch((error) => setActionError(errorText(error) || 'We could not start that roadmap. Try again with the same goal.'))
      .finally(() => setCreating(false))
  }

  return <div className="page-stack roadmaps-page">
    <div className="page-intro"><div><span className="eyebrow">Structured learning</span><h2>Learning roadmaps</h2><p>Choose a thoughtful starting point for the role you want to grow toward.</p></div><button className="button" onClick={() => setDialogOpen(true)}><Plus size={16} /> Request custom roadmap</button></div>
    <div className="roadmap-disclaimer"><Sparkles size={16} /><span>Roadmaps are learning suggestions, not official career requirements. Verify generated suggestions against current job descriptions and trusted sources.</span></div>
    <section className="course-toolbar roadmap-toolbar" aria-label="Roadmap filters"><label className="search-box course-search"><Search size={17} /><input placeholder="Search roles" aria-label="Search roles" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="subject-filters" role="group" aria-label="Filter by roadmap category"><button className={recommendedOnly ? 'selected' : ''} onClick={() => setRecommendedOnly(true)} disabled={!profile?.domain}>For you</button><button className={!recommendedOnly && category === 'All' ? 'selected' : ''} onClick={() => { setRecommendedOnly(false); setCategory('All') }}>All roadmaps</button>{categories.slice(1).map((option) => <button key={option} className={!recommendedOnly && category === option ? 'selected' : ''} onClick={() => { setRecommendedOnly(false); setCategory(option) }}>{option}</button>)}</div></section>
    {profile?.domain && recommendedOnly && <p className="personalization-note">Prioritized for <strong>{profile.domain}</strong>{profile.specialization ? ` · ${profile.specialization}` : ''}. <button className="text-button" onClick={() => setRecommendedOnly(false)}>Explore every roadmap</button></p>}
        {loading ? <RoadmapSkeleton /> : error ? <EmptyState title="Roadmaps could not load" text={error} action={<button className="button button-secondary"     onClick={() => loadRoadmaps()}>Try again</button>} /> : visible.length ? <div className="roadmap-library">{visible.map((roadmap) => <RoadmapCard roadmap={roadmap} key={roadmap.id} />)}</div> : <EmptyState title="No roadmaps match that search" text="Try another role or category, or request a custom roadmap." />}
    {dialogOpen && <CustomRoadmapDialog busy={creating} error={actionError} onClose={() => { setDialogOpen(false); setActionError('') }} onSubmit={createRoadmap} />}
  </div>
}

function RoadmapCard({ roadmap }: { roadmap: RoadmapSummary }) {
  return <Link to={`/roadmaps/${roadmap.id}`} className={`roadmap-library-card roadmap-${roadmap.color}`}><div className="roadmap-card-top"><div className="roadmap-icon"><Map size={21} /></div><span className={`roadmap-source ${roadmap.source === 'AI-generated' ? 'generated' : ''}`}>{roadmap.source}</span></div><span className="eyebrow">{roadmap.category}{roadmap.topicCount ? ` · ${roadmap.topicCount} topics` : ''}</span><h3>{roadmap.role}</h3><p>{roadmap.description || (roadmap.status === 'generating' ? 'Your roadmap is being drafted from your goal.' : '')}</p>{roadmap.topicCount > 0 && <div className="roadmap-topic-summary"><span><strong>Core</strong> {roadmap.coreTopics.join(' · ')}</span>{roadmap.optionalTopics.length > 0 && <span><strong>Optional</strong> {roadmap.optionalTopics.join(' · ')}</span>}</div>}<div className="roadmap-card-footer">{roadmap.status === 'generating' ? <span className="roadmap-card-status"><Loader2 size={14} className="spin" /> Generating with the AI model…</span> : roadmap.status === 'failed' ? <span className="roadmap-card-status failed">Generation failed. Open it to try again.</span> : <><ProgressBar value={roadmap.progress} color={roadmap.color === 'orange' ? 'orange' : roadmap.color === 'green' ? 'green' : 'purple'} /><span>{roadmap.progress}% complete</span></>}<ArrowRight size={17} /></div></Link>
}

function CustomRoadmapDialog({ busy, error, onClose, onSubmit }: { busy: boolean; error: string; onClose: () => void; onSubmit: (input: CreateRoadmapInput) => void }) {
  const apiMode = getDataMode('roadmaps') === 'api'
  const [role, setRole] = useState('')
  const [category, setCategory] = useState<RoadmapCategory>('Engineering')
  const [goal, setGoal] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const valid = role.trim().length >= 3 && goal.trim().length >= 10
  function submit(event: FormEvent) { event.preventDefault(); setSubmitted(true); if (valid) onSubmit({ role: role.trim(), category, goal: goal.trim() }) }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><form className="dialog roadmap-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="custom-roadmap-title"><div className="dialog-heading"><div><span className="eyebrow">{apiMode ? 'AI generation' : 'Mock generation'}</span><h2 id="custom-roadmap-title">Request a custom roadmap</h2><p>{apiMode ? 'The local AI model drafts the topics, their order and prerequisites for your goal. It takes a few minutes; you can keep using the app meanwhile. The roadmap stays private to you.' : 'We will create a predefined mock suggestion from your goal.'}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">×</button></div><label>Target role<input value={role} onChange={(event) => setRole(event.target.value)} placeholder="e.g. UX researcher" /></label>{submitted && role.trim().length < 3 && <small className="form-error">Add a target role.</small>}<label>Category<select value={category} onChange={(event) => setCategory(event.target.value as RoadmapCategory)}>{categories.slice(1).map((option) => <option key={option}>{option}</option>)}</select></label><label>What do you want to be able to do?<textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Describe the kind of work or project you want to prepare for." rows={4} /></label>{submitted && goal.trim().length < 10 && <small className="form-error">Tell us a little more about your goal.</small>}<p className="roadmap-dialog-note">{apiMode ? 'Generated roadmaps are AI suggestions. Verify them against current job descriptions and trusted sources before treating them as career guidance.' : 'Generated roadmaps are mock suggestions. Verify them before treating them as career guidance.'}</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancel</button><button type="submit" className="button" disabled={busy}>{busy ? 'Starting…' : apiMode ? 'Generate roadmap' : 'Generate mock roadmap'}</button></div></form></div>
}

function RoadmapSkeleton() { return <div className="roadmap-library roadmap-library-skeleton" role="status" aria-label="Loading roadmaps">{[1, 2, 3, 4].map((item) => <div key={item}><span /><span /><span /></div>)}</div> }

/** Conflicts (409) carry a specific explanation from the server, e.g. a generation already running. */
function errorText(error: unknown) {
  return error instanceof ApiError && error.code === 'conflict' && error.message ? error.message : classifyAiError(error).userMessage
}
