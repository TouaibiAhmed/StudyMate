import { AlertCircle, ArrowRight, BarChart3, CheckCircle2, Clock3, HelpCircle, Search, Target, TrendingUp, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { ProgressBar } from '../components/ui/ProgressBar'
import { StatCard } from '../components/ui/StatCard'
import { progressService } from '../services/api-client'
import type { ConceptStatus, ProgressConcept, ProgressData, ProgressSession } from '../services/contracts/progress'

const statusOrder: ConceptStatus[] = ['Needs practice', 'Developing', 'Good evidence', 'Not enough evidence']

export function ProgressPage() {
  const [data, setData] = useState<ProgressData>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'All' | ConceptStatus>('All')
  const [conceptSearch, setConceptSearch] = useState('')
  const [selectedConcept, setSelectedConcept] = useState<ProgressConcept>()
  const [sessionFilter, setSessionFilter] = useState<'All' | 'Completed' | 'Needs review'>('All')

  useEffect(() => {
    let active = true
    void progressService.getProgress().then((progress) => {
      if (active) {
        setData(progress)
        setLoading(false)
      }
    }).catch(() => {
      if (active) {
        setError(true)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selectedConcept) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedConcept(undefined)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedConcept])

  if (loading) return <ProgressSkeleton />
  if (error || !data) return <EmptyState title="Progress could not load" text="Your learning records are safe. Return home and try again." />

  const normalizedSearch = conceptSearch.trim().toLowerCase()
  const filteredConcepts = data.concepts.filter((concept) => {
    const matchesStatus = statusFilter === 'All' || concept.status === statusFilter
    const matchesSearch = !normalizedSearch || concept.name.toLowerCase().includes(normalizedSearch)
    return matchesStatus && matchesSearch
  })
  const needsAttention = data.concepts.filter((concept) => concept.status === 'Needs practice' || concept.status === 'Not enough evidence')
  const filteredSessions = data.recentSessions.filter((session) => sessionFilter === 'All' || (sessionFilter === 'Completed' ? session.completed : session.verdict !== 'Correct'))
  const hours = `${Math.floor(data.studyMinutes / 60)}h ${data.studyMinutes % 60}m`

  return <div className="page-stack progress-page">
    <div className="page-intro"><div><span className="eyebrow">Evidence, not just numbers</span><h2>Study progress</h2><p>See what your recent reasoning demonstrates, and where a little practice will help next.</p></div><select className="select" aria-label="Progress time range"><option>Last 7 days</option><option>Last 30 days</option></select></div>
    <div className="stats-row progress-stats"><StatCard icon={<Clock3 size={18} />} label="Study time" value={hours} detail="Across 8 focused sessions" color="purple" /><StatCard icon={<CheckCircle2 size={18} />} label="Questions answered" value={`${data.questionsAnswered}`} detail="17 with useful evidence" color="green" /><StatCard icon={<Target size={18} />} label="Concepts reviewed" value={`${data.concepts.length}`} detail={`${needsAttention.length} need attention`} color="orange" /></div>

    <div className="progress-overview-grid">
      <section className="progress-panel activity-chart-panel"><div className="section-heading"><div><span className="eyebrow">Weekly rhythm</span><h2>Questions and sessions</h2></div><BarChart3 size={19} className="section-icon" /></div><p className="panel-intro">The shape of your week matters more than a single score. Friday was your strongest study day.</p><div className="progress-chart"><ResponsiveContainer width="100%" height={230}><BarChart data={data.weeklyActivity} barGap={5} margin={{ top: 16, right: 4, left: -20, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--subtle)', fontSize: 10 }} /><Tooltip cursor={{ fill: 'var(--paper)' }} contentStyle={{ border: '1px solid var(--line)', borderRadius: 4, fontSize: 11, background: 'var(--surface)' }} /><Bar dataKey="questions" name="Questions" fill="var(--forest)" radius={[2, 2, 0, 0]} /><Bar dataKey="sessions" name="Sessions" fill="var(--coral)" radius={[2, 2, 0, 0]} /></BarChart></ResponsiveContainer></div><div className="chart-legend"><span><i className="legend-questions" /> Questions answered</span><span><i className="legend-sessions" /> Sessions completed</span></div></section>
      <section className="progress-panel evidence-panel"><div className="section-heading"><div><span className="eyebrow">How to read this</span><h2>Evidence levels</h2></div><HelpCircle size={18} className="section-icon" /></div><div className="evidence-list">{statusOrder.map((status) => <div className="evidence-row" key={status}><span className={`status-dot ${statusClass(status)}`} /><div><strong>{status}</strong><p>{statusDescription(status)}</p></div></div>)}</div><p className="evidence-note"><AlertCircle size={14} /> A high progress bar is a prompt to keep testing your understanding, not proof of mastery.</p></section>
    </div>

    <section className="progress-panel concept-panel"><div className="section-heading"><div><span className="eyebrow">Concept-level view</span><h2>Your concepts</h2></div><label className="concept-search"><Search size={14} /><span className="sr-only">Search concepts</span><input value={conceptSearch} onChange={(event) => setConceptSearch(event.target.value)} placeholder="Search concepts" /></label></div><div className="concept-filters">{(['All', ...statusOrder] as const).map((status) => <button key={status} className={statusFilter === status ? 'selected' : ''} onClick={() => setStatusFilter(status)}>{status}</button>)}</div>{filteredConcepts.length ? <div className="progress-concept-list">{filteredConcepts.map((concept) => <ConceptRow concept={concept} key={concept.id} onOpen={() => setSelectedConcept(concept)} />)}</div> : <div className="inline-empty">No concepts match this search and status filter. Try clearing one of the filters.</div>}</section>

    <div className="progress-lower-grid">
      <section className="progress-panel weak-concepts-panel"><div className="section-heading"><div><span className="eyebrow">Where to focus next</span><h2>Needs attention</h2></div><TrendingUp size={18} className="section-icon" /></div><div className="weak-concept-list">{needsAttention.map((concept) => <WeakConcept concept={concept} key={concept.id} />)}</div></section>
      <section className="progress-panel recent-outcomes-panel"><div className="section-heading"><div><span className="eyebrow">Recent evidence</span><h2>Study sessions</h2></div><Clock3 size={18} className="section-icon" /></div><div className="session-filters">{(['All', 'Completed', 'Needs review'] as const).map((filter) => <button key={filter} className={sessionFilter === filter ? 'selected' : ''} onClick={() => setSessionFilter(filter)}>{filter}</button>)}</div>{filteredSessions.length ? <div className="outcome-list">{filteredSessions.map((session) => <SessionHistoryRow session={session} key={session.id} />)}</div> : <div className="inline-empty">{sessionFilter === 'Completed' ? 'No completed sessions yet. Finish a study session to see its summary here.' : 'No sessions need review right now.'}</div>}</section>
    </div>
    {selectedConcept && <ConceptDetail concept={selectedConcept} onClose={() => setSelectedConcept(undefined)} />}
  </div>
}

function ConceptRow({ concept, onOpen }: { concept: ProgressConcept; onOpen: () => void }) {
  return <button className="progress-concept-row" onClick={onOpen} aria-label={`View details for ${concept.name}`}><div className={`concept-status-mark ${statusClass(concept.status)}`}><StatusIcon status={concept.status} /></div><div className="progress-concept-copy"><div><strong>{concept.name}</strong><span>{concept.course}</span></div><p>{concept.evidence}</p></div><div className="progress-concept-meter"><ProgressBar value={concept.progress} color={concept.status === 'Good evidence' ? 'green' : concept.status === 'Needs practice' ? 'orange' : 'purple'} /><small>{concept.progress}% signal</small></div><span className={`status-label ${statusClass(concept.status)}`}>{concept.status}</span><ArrowRight size={15} /></button>
}

function WeakConcept({ concept }: { concept: ProgressConcept }) {
  return <div className="weak-concept"><div className={`concept-status-mark ${statusClass(concept.status)}`}><StatusIcon status={concept.status} /></div><div><strong>{concept.name}</strong><span>{concept.reason}</span><small>{concept.course}</small></div><Link className="text-link" to={concept.practiceSessionId ? `/study/${concept.practiceSessionId}` : `/courses/${concept.courseId}`}>Revise <ArrowRight size={14} /></Link></div>
}

function SessionHistoryRow({ session }: { session: ProgressSession }) {
  return <Link className="outcome-row" to={`/study/${session.id}`}><div className={`outcome-mark ${session.verdict === 'Correct' ? 'positive' : 'review'}`}>{session.verdict === 'Correct' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}</div><div><strong>{session.title}</strong><span>{session.course} · {session.date} · {session.duration}</span><small>{session.outcome}</small></div><span className="session-review-link">Review summary</span><ArrowRight size={15} /></Link>
}

function ConceptDetail({ concept, onClose }: { concept: ProgressConcept; onClose: () => void }) {
  return <div className="concept-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="concept-dialog" role="dialog" aria-modal="true" aria-labelledby="concept-dialog-title"><div className="concept-dialog-header"><div><span className="eyebrow">Concept detail</span><h2 id="concept-dialog-title">{concept.name}</h2><p>{concept.course} · {concept.status}</p></div><button className="icon-button" onClick={onClose} aria-label="Close concept details"><X size={18} /></button></div><div className="concept-dialog-action"><span className="eyebrow">Recommended next action</span><strong>{concept.recommendedAction}</strong>{concept.practiceSessionId && <Link className="button button-primary" to={`/study/${concept.practiceSessionId}`}>Start targeted practice <ArrowRight size={15} /></Link>}</div><div className="concept-attempts"><div className="section-heading"><div><span className="eyebrow">Mock evaluation evidence</span><h3>Recent attempts</h3></div></div>{concept.attempts.length ? concept.attempts.map((attempt) => <div className="concept-attempt" key={attempt.id}><div className={`outcome-mark ${attempt.verdict === 'Correct' ? 'positive' : 'review'}`}>{attempt.verdict === 'Correct' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}</div><div><strong>{attempt.verdict} · {attempt.date}</strong><p>“{attempt.answer}”</p><span>{attempt.evidence} Confidence: {attempt.confidence}.</span></div></div>) : <div className="inline-empty">No attempts yet. Start the targeted practice to create your first piece of evidence.</div>}</div><button className="text-link concept-dialog-close" onClick={onClose}>Close details</button></section></div>
}

function StatusIcon({ status }: { status: ConceptStatus }) {
  if (status === 'Good evidence') return <CheckCircle2 size={15} />
  if (status === 'Needs practice') return <AlertCircle size={15} />
  if (status === 'Developing') return <TrendingUp size={15} />
  return <HelpCircle size={15} />
}

function statusClass(status: ConceptStatus) {
  return status.toLowerCase().replaceAll(' ', '-')
}

function statusDescription(status: ConceptStatus) {
  if (status === 'Needs practice') return 'A recent response shows a clear gap to revisit.'
  if (status === 'Developing') return 'You have some useful evidence; keep connecting the ideas.'
  if (status === 'Good evidence') return 'Several explanations hold up across activities.'
  return 'There is not enough answered work to draw a conclusion.'
}

function ProgressSkeleton() {
  return <div className="progress-skeleton" role="status" aria-label="Loading progress"><span /><div><span /><span /></div><div><span /><span /><span /></div></div>
}
