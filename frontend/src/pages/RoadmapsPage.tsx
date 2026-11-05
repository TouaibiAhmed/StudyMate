import { ArrowRight, Map, Plus, Search, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { ProgressBar } from '../components/ui/ProgressBar'
import { roadmapService } from '../services/api-client'
import type { CreateRoadmapInput, RoadmapCategory, RoadmapSummary } from '../services/contracts/roadmaps'

const categories: Array<'All' | RoadmapCategory> = ['All', 'Data', 'Engineering', 'Machine learning', 'Business']

export function RoadmapsPage() {
  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'All' | RoadmapCategory>('All')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void roadmapService.listRoadmaps().then((items) => { setRoadmaps(items); setLoading(false) })
  }, [])

  const visible = useMemo(() => roadmaps.filter((roadmap) => {
    const matchesQuery = `${roadmap.role} ${roadmap.description} ${roadmap.category}`.toLowerCase().includes(query.trim().toLowerCase())
    return matchesQuery && (category === 'All' || roadmap.category === category)
  }), [category, query, roadmaps])

  function createRoadmap(input: CreateRoadmapInput) {
    void roadmapService.createRoadmap(input).then((roadmap) => {
      setRoadmaps((current) => [roadmap, ...current])
      setDialogOpen(false)
    })
  }

  return <div className="page-stack roadmaps-page">
    <div className="page-intro"><div><span className="eyebrow">Structured learning</span><h2>Learning roadmaps</h2><p>Choose a thoughtful starting point for the role you want to grow toward.</p></div><button className="button" onClick={() => setDialogOpen(true)}><Plus size={16} /> Request custom roadmap</button></div>
    <div className="roadmap-disclaimer"><Sparkles size={16} /><span>Roadmaps are learning suggestions, not official career requirements. Verify generated suggestions against current job descriptions and trusted sources.</span></div>
    <section className="course-toolbar roadmap-toolbar" aria-label="Roadmap filters"><label className="search-box course-search"><Search size={17} /><input placeholder="Search roles" aria-label="Search roles" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="subject-filters" role="group" aria-label="Filter by roadmap category">{categories.map((option) => <button key={option} className={category === option ? 'selected' : ''} onClick={() => setCategory(option)}>{option}</button>)}</div></section>
    {loading ? <RoadmapSkeleton /> : visible.length ? <div className="roadmap-library">{visible.map((roadmap) => <RoadmapCard roadmap={roadmap} key={roadmap.id} />)}</div> : <EmptyState title="No roadmaps match that search" text="Try another role or category, or request a custom roadmap." />}
    {dialogOpen && <CustomRoadmapDialog onClose={() => setDialogOpen(false)} onSubmit={createRoadmap} />}
  </div>
}

function RoadmapCard({ roadmap }: { roadmap: RoadmapSummary }) {
  return <Link to={`/roadmaps/${roadmap.id}`} className={`roadmap-library-card roadmap-${roadmap.color}`}><div className="roadmap-card-top"><div className="roadmap-icon"><Map size={21} /></div><span className={`roadmap-source ${roadmap.source === 'AI-generated mock' ? 'generated' : ''}`}>{roadmap.source}</span></div><span className="eyebrow">{roadmap.category} · {roadmap.topicCount} topics</span><h3>{roadmap.role}</h3><p>{roadmap.description}</p><div className="roadmap-topic-summary"><span><strong>Core</strong> {roadmap.coreTopics.join(' · ')}</span><span><strong>Optional</strong> {roadmap.optionalTopics.join(' · ')}</span></div><div className="roadmap-card-footer"><ProgressBar value={roadmap.progress} color={roadmap.color === 'orange' ? 'orange' : roadmap.color === 'green' ? 'green' : 'purple'} /><span>{roadmap.progress}% complete</span><ArrowRight size={17} /></div></Link>
}

function CustomRoadmapDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: CreateRoadmapInput) => void }) {
  const [role, setRole] = useState('')
  const [category, setCategory] = useState<RoadmapCategory>('Engineering')
  const [goal, setGoal] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const valid = role.trim().length >= 3 && goal.trim().length >= 10
  function submit(event: FormEvent) { event.preventDefault(); setSubmitted(true); if (valid) onSubmit({ role: role.trim(), category, goal: goal.trim() }) }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><form className="dialog roadmap-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="custom-roadmap-title"><div className="dialog-heading"><div><span className="eyebrow">Mock generation</span><h2 id="custom-roadmap-title">Request a custom roadmap</h2><p>We will create a predefined mock suggestion from your goal.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">×</button></div><label>Target role<input value={role} onChange={(event) => setRole(event.target.value)} placeholder="e.g. UX researcher" /></label>{submitted && role.trim().length < 3 && <small className="form-error">Add a target role.</small>}<label>Category<select value={category} onChange={(event) => setCategory(event.target.value as RoadmapCategory)}>{categories.slice(1).map((option) => <option key={option}>{option}</option>)}</select></label><label>What do you want to be able to do?<textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Describe the kind of work or project you want to prepare for." rows={4} /></label>{submitted && goal.trim().length < 10 && <small className="form-error">Tell us a little more about your goal.</small>}<p className="roadmap-dialog-note">Generated roadmaps are mock suggestions. Verify them before treating them as career guidance.</p><div className="dialog-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancel</button><button type="submit" className="button">Generate mock roadmap</button></div></form></div>
}

function RoadmapSkeleton() { return <div className="roadmap-library roadmap-library-skeleton" role="status" aria-label="Loading roadmaps">{[1, 2, 3, 4].map((item) => <div key={item}><span /><span /><span /></div>)}</div> }
