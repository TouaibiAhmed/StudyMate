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
  const [courseFilter, setCourseFilter] = useState<string>('All')
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('7d')
  const [conceptSearch, setConceptSearch] = useState('')
  const [selectedConcept, setSelectedConcept] = useState<ProgressConcept>()
  const [sessionFilter, setSessionFilter] = useState<'All' | 'Completed' | 'Needs review'>('All')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(false)

    void progressService
      .getProgress({
        range: timeRange,
        courseId: courseFilter === 'All' ? undefined : courseFilter,
      })
      .then((progress) => {
        if (active) {
          setData(progress)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setError(true)
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [timeRange, courseFilter])

  useEffect(() => {
    if (!selectedConcept) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedConcept(undefined)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedConcept])

  if (loading) return <ProgressSkeleton />
  if (error || !data) return <EmptyState title="Progress could not load" text="Your learning records are safe. Try refreshing the page." />

  const normalizedSearch = conceptSearch.trim().toLowerCase()
  const filteredConcepts = data.concepts.filter((concept) => {
    const matchesStatus = statusFilter === 'All' || concept.status === statusFilter
    const matchesCourse = courseFilter === 'All' || concept.courseId === courseFilter || concept.course === courseFilter
    const matchesSearch = !normalizedSearch || concept.name.toLowerCase().includes(normalizedSearch) || concept.course.toLowerCase().includes(normalizedSearch)
    return matchesStatus && matchesCourse && matchesSearch
  })

  const needsAttention = data.concepts.filter((concept) => concept.status === 'Needs practice' || concept.status === 'Not enough evidence')
  const filteredSessions = data.recentSessions.filter((session) => {
    const matchesSessionFilter = sessionFilter === 'All' || (sessionFilter === 'Completed' ? session.completed : session.verdict !== 'Correct')
    const matchesCourse = courseFilter === 'All' || session.courseId === courseFilter || session.course === courseFilter
    return matchesSessionFilter && matchesCourse
  })

  const hours = `${Math.floor(data.studyMinutes / 60)}h ${data.studyMinutes % 60}m`

  // Derive unique courses for filter dropdown
  const availableCourses = data.courses && data.courses.length > 0
    ? data.courses
    : Array.from(new Set(data.concepts.map((c) => ({ id: c.courseId || c.course, title: c.course }))))

  return (
    <div className="page-stack progress-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">Evidence-led learning state</span>
          <h2>Study progress</h2>
          <p>See what your recent reasoning demonstrates, and where targeted practice will help next.</p>
        </div>
        <div className="progress-top-filters">
          {availableCourses.length > 0 && (
            <select
              className="select"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              aria-label="Filter by course"
            >
              <option value="All">All courses</option>
              {availableCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          )}
          <select
            className="select"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as '7d' | '30d' | 'all')}
            aria-label="Progress time range"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      <div className="stats-row progress-stats">
        <StatCard
          icon={<Clock3 size={18} />}
          label="Study time"
          value={hours}
          detail={`Across ${data.sessionsCompleted} recorded sessions`}
          color="purple"
        />
        <StatCard
          icon={<CheckCircle2 size={18} />}
          label="Questions answered"
          value={`${data.questionsAnswered}`}
          detail={`${data.concepts.filter((c) => c.status === 'Good evidence').length} concepts with solid evidence`}
          color="green"
        />
        <StatCard
          icon={<Target size={18} />}
          label="Concepts reviewed"
          value={`${data.concepts.length}`}
          detail={`${data.concepts.filter((c) => c.status === 'Needs practice').length} need practice · ${data.concepts.filter((c) => c.status === 'Not enough evidence').length} not studied yet`}
          color="orange"
        />
      </div>

      <div className="progress-overview-grid">
        <section className="progress-panel activity-chart-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Activity history</span>
              <h2>Weekly rhythm</h2>
            </div>
            <BarChart3 size={19} className="section-icon" />
          </div>
          <p className="panel-intro">Consistent daily retrieval practice builds durable retention across sessions.</p>
          <div className="progress-chart">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={data.weeklyActivity} barGap={5} margin={{ top: 16, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--subtle)', fontSize: 10 }} />
                <Tooltip
                  cursor={{ fill: 'var(--paper)' }}
                  contentStyle={{ border: '1px solid var(--line)', borderRadius: 4, fontSize: 11, background: 'var(--surface)' }}
                />
                <Bar dataKey="questions" name="Questions" fill="var(--forest)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="sessions" name="Sessions" fill="var(--coral)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-legend">
            <span><i className="legend-questions" /> Questions answered</span>
            <span><i className="legend-sessions" /> Sessions completed</span>
          </div>
        </section>

        <section className="progress-panel evidence-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Understanding signals</span>
              <h2>Evidence levels</h2>
            </div>
            <HelpCircle size={18} className="section-icon" />
          </div>
          <div className="evidence-list">
            {statusOrder.map((status) => (
              <div className="evidence-row" key={status}>
                <span className={`status-dot ${statusClass(status)}`} />
                <div>
                  <strong>{status}</strong>
                  <p>{statusDescription(status)}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="evidence-note">
            <AlertCircle size={14} /> Progress indicators reflect cautious heuristics based on response evidence, not psychometric certainty.
          </p>
        </section>
      </div>

      <section className="progress-panel concept-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Concept-level view</span>
            <h2>Your concepts</h2>
          </div>
          <label className="concept-search">
            <Search size={14} />
            <span className="sr-only">Search concepts</span>
            <input
              value={conceptSearch}
              onChange={(event) => setConceptSearch(event.target.value)}
              placeholder="Search concepts or courses"
            />
          </label>
        </div>
        <div className="concept-filters">
          {(['All', ...statusOrder] as const).map((status) => (
            <button
              key={status}
              className={statusFilter === status ? 'selected' : ''}
              onClick={() => setStatusFilter(status)}
            >
              {status}
            </button>
          ))}
        </div>
        {filteredConcepts.length ? (
          <div className="progress-concept-list">
            {filteredConcepts.map((concept) => (
              <ConceptRow concept={concept} key={concept.id} onOpen={() => setSelectedConcept(concept)} />
            ))}
          </div>
        ) : (
          <div className="inline-empty">No concepts match the selected filters. Try broadening your search or choosing another course.</div>
        )}
      </section>

      <div className="progress-lower-grid">
        <section className="progress-panel weak-concepts-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Revision recommendations</span>
              <h2>Needs attention</h2>
            </div>
            <TrendingUp size={18} className="section-icon" />
          </div>
          <div className="weak-concept-list">
            {needsAttention.map((concept) => (
              <WeakConcept concept={concept} key={concept.id} />
            ))}
            {needsAttention.length === 0 && (
              <div className="inline-empty">All reviewed concepts currently have good evidence. Great work!</div>
            )}
          </div>
        </section>

        <section className="progress-panel recent-outcomes-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Recent evidence</span>
              <h2>Study sessions</h2>
            </div>
            <Clock3 size={18} className="section-icon" />
          </div>
          <div className="session-filters">
            {(['All', 'Completed', 'Needs review'] as const).map((filter) => (
              <button
                key={filter}
                className={sessionFilter === filter ? 'selected' : ''}
                onClick={() => setSessionFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
          {filteredSessions.length ? (
            <div className="outcome-list">
              {filteredSessions.map((session) => (
                <SessionHistoryRow session={session} key={session.id} />
              ))}
            </div>
          ) : (
            <div className="inline-empty">
              {sessionFilter === 'Completed' ? 'No completed sessions yet. Finish a study session to see its summary here.' : 'No sessions currently need review.'}
            </div>
          )}
        </section>
      </div>

      {selectedConcept && <ConceptDetail concept={selectedConcept} onClose={() => setSelectedConcept(undefined)} />}
    </div>
  )
}

function ConceptRow({ concept, onOpen }: { concept: ProgressConcept; onOpen: () => void }) {
  return (
    <button className="progress-concept-row" onClick={onOpen} aria-label={`View details for ${concept.name}`}>
      <div className={`concept-status-mark ${statusClass(concept.status)}`}>
        <StatusIcon status={concept.status} />
      </div>
      <div className="progress-concept-copy">
        <div>
          <strong>{concept.name}</strong>
          <span>{concept.course}</span>
        </div>
        <p>{concept.evidence}</p>
      </div>
      <div className="progress-concept-meter">
        <ProgressBar
          value={concept.progress}
          color={concept.status === 'Good evidence' ? 'green' : concept.status === 'Needs practice' ? 'orange' : 'purple'}
        />
        <small>{concept.progress}% signal</small>
      </div>
      <span className={`status-label ${statusClass(concept.status)}`}>{concept.status}</span>
      <ArrowRight size={15} />
    </button>
  )
}

function WeakConcept({ concept }: { concept: ProgressConcept }) {
  return (
    <div className="weak-concept">
      <div className={`concept-status-mark ${statusClass(concept.status)}`}>
        <StatusIcon status={concept.status} />
      </div>
      <div>
        <strong>{concept.name}</strong>
        <span>{concept.reason || concept.revisionReason || 'Unresolved gap identified from recent answers.'}</span>
        <small>{concept.course}</small>
      </div>
      <Link
        className="text-link"
        to={concept.practiceSessionId ? `/study/${concept.practiceSessionId}` : concept.courseId ? `/courses/${concept.courseId}` : '/courses'}
      >
        Revise <ArrowRight size={14} />
      </Link>
    </div>
  )
}

function SessionHistoryRow({ session }: { session: ProgressSession }) {
  const isPositive = session.verdict === 'Correct'
  return (
    <Link className="outcome-row" to={`/study/${session.id}`}>
      <div className={`outcome-mark ${isPositive ? 'positive' : 'review'}`}>
        {isPositive ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      </div>
      <div>
        <strong>{session.title}</strong>
        <span>{session.course} · {session.date} · {session.duration}</span>
        <small>{session.outcome}</small>
      </div>
      <span className="session-review-link">Review summary</span>
      <ArrowRight size={15} />
    </Link>
  )
}

function ConceptDetail({ concept, onClose }: { concept: ProgressConcept; onClose: () => void }) {
  return (
    <div
      className="concept-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="concept-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="concept-dialog-title"
      >
        <div className="concept-dialog-header">
          <div>
            <span className="eyebrow">Concept evidence detail</span>
            <h2 id="concept-dialog-title">{concept.name}</h2>
            <p>
              {concept.course} · <span className={`status-label ${statusClass(concept.status)}`}>{concept.status}</span>
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close concept details">
            <X size={18} />
          </button>
        </div>

        <div className="concept-dialog-action">
          <span className="eyebrow">Coach recommendation</span>
          <strong>{concept.recommendedAction}</strong>
          <Link
            className="button button-primary"
            to={concept.practiceSessionId ? `/study/${concept.practiceSessionId}` : concept.courseId ? `/courses/${concept.courseId}` : '/courses'}
          >
            Start targeted practice <ArrowRight size={15} />
          </Link>
        </div>

        <div className="concept-attempts">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Demonstrated response history</span>
              <h3>Recorded evidence</h3>
            </div>
          </div>
          {concept.attempts.length ? (
            concept.attempts.map((attempt) => (
              <div className="concept-attempt" key={attempt.id}>
                <div className={`outcome-mark ${attempt.verdict === 'Correct' ? 'positive' : 'review'}`}>
                  {attempt.verdict === 'Correct' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                </div>
                <div>
                  <strong>{attempt.verdict} · {attempt.date}</strong>
                  <p>“{attempt.answer}”</p>
                  <span>
                    {attempt.evidence} {attempt.confidence && `· Confidence: ${attempt.confidence}`}
                  </span>
                  {attempt.sources && attempt.sources.length > 0 && (
                    <small className="attempt-sources">Cited: {attempt.sources.join(', ')}</small>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="inline-empty">
              No response attempts recorded yet. Start targeted practice to generate your first concept evidence.
            </div>
          )}
        </div>

        <button className="text-link concept-dialog-close" onClick={onClose}>
          Close details
        </button>
      </section>
    </div>
  )
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
  if (status === 'Needs practice') return 'A recent response shows an unresolved gap to revisit.'
  if (status === 'Developing') return 'Demonstrated partial understanding; continue connecting key ideas.'
  if (status === 'Good evidence') return 'Multiple independent explanations hold up across learning activities.'
  return 'Not enough answered practice yet to form a reliable indicator.'
}

function ProgressSkeleton() {
  return (
    <div className="progress-skeleton" role="status" aria-label="Loading progress">
      <span />
      <div><span /><span /></div>
      <div><span /><span /><span /></div>
    </div>
  )
}
