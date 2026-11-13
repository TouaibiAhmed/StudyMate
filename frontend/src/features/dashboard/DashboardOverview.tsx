import { ArrowRight, BookOpen, Check, ChevronRight, Clock3, Flame, Loader2, Play, RotateCcw, Target, TrendingUp, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/feedback/EmptyState'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { dashboardService, studySessionService } from '../../services/api-client'
import { classifyAiError } from '../../services/ai-error'
import { ApiError } from '../../services/http-client'
import type { DashboardData, DashboardNextStep } from '../../services/contracts/dashboard'
import { DashboardSkeleton } from './DashboardSkeleton'

type WeekDay = DashboardData['weeklyActivity'][number] & { isToday?: boolean; isFuture?: boolean }

export function DashboardOverview() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData>()
  const [loadError, setLoadError] = useState(false)
  const [recommendationVisible, setRecommendationVisible] = useState(true)
  const [starting, setStarting] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let active = true
    void dashboardService.getDashboard()
      .then((dashboard) => { if (active) setData(dashboard) })
      .catch(() => { if (active) setLoadError(true) })
    return () => { active = false }
  }, [])

  /** Starts a study session on a concept of the student's course and opens it. */
  async function studyConcept(courseId: string | null | undefined, conceptId: string | null | undefined, key: string) {
    if (!studySessionService.startSession || !courseId) return
    setStarting(key); setActionError('')
    try {
      const session = await studySessionService.startSession({ courseId, conceptId: conceptId ?? undefined })
      navigate(`/study/${session.id}`)
    } catch (error) {
      setActionError(error instanceof ApiError && error.code === 'conflict' && error.message ? error.message : classifyAiError(error).userMessage)
      setStarting('')
    }
  }

  function openNextStep(step: DashboardNextStep) {
    if (step.kind === 'study_concept') void studyConcept(step.courseId, step.conceptId, 'next')
    else if (step.href) navigate(step.href)
  }

  if (!data && !loadError) return <DashboardSkeleton />
  if (loadError || !data) return <EmptyState title="Your dashboard could not load" text="Please try again from the home link. No study data was changed." />
  if (data.isFirstTime) return <FirstTime data={data} onNextStep={openNextStep} />

  return <DashboardContent data={data} starting={starting} actionError={actionError} recommendationVisible={recommendationVisible}
    onDismissRecommendation={() => setRecommendationVisible(false)} onNextStep={openNextStep}
    onPractice={(courseId, conceptId) => void studyConcept(courseId, conceptId, conceptId)} />
}

function FirstTime({ data, onNextStep }: { data: DashboardData; onNextStep: (step: DashboardNextStep) => void }) {
  const step = data.nextStep
  return <EmptyState title={`Welcome, ${data.greeting.name}. Your study space is ready`} text={step ? `${step.title}: ${step.detail}` : 'Start your first course or study session and your progress will appear here.'}
    action={<span className="empty-state-actions">{step && <button className="button" onClick={() => onNextStep(step)}>{step.title} <ArrowRight size={15} /></button>}<Link className="button button-ghost" to="/roadmaps">Explore roadmaps</Link></span>} />
}

function headerDate(today?: string) {
  const date = today ? new Date(`${today}T12:00:00`) : new Date()
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

type DashboardContentProps = {
  data: DashboardData
  starting: string
  actionError: string
  recommendationVisible: boolean
  onDismissRecommendation: () => void
  onNextStep: (step: DashboardNextStep) => void
  onPractice: (courseId: string, conceptId: string) => void
}

function DashboardContent({ data, starting, actionError, recommendationVisible, onDismissRecommendation, onNextStep, onPractice }: DashboardContentProps) {
  const week = data.weeklyActivity as WeekDay[]
  const maxActivity = useMemo(() => Math.max(...week.map(({ minutes }) => minutes), 1), [week])
  const totalMinutes = data.weekMinutes ?? week.reduce((total, { minutes }) => total + minutes, 0)
  const totalTime = totalMinutes < 60 ? `${totalMinutes}m` : `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
  const step = data.nextStep
  const streak = data.streak
  const cont = data.continueLearning
  const roadmap = data.roadmap

  return (
    <div className="home-dashboard">
      <section className="dashboard-lead">
        <div className="lead-copy">
          <span className="eyebrow">{headerDate(data.today)}</span>
          <h2>Good {data.partOfDay ?? 'morning'}, {data.greeting.name}.</h2>
          <p>Let’s make your next study hour count.{data.greeting.focus && <> Your current focus is <strong>{data.greeting.focus}</strong>.</>}</p>
          {step && recommendationVisible && <div className="recommendation"><div className="recommendation-mark"><Target size={17} /></div><div><span className="eyebrow">Your next best step</span><strong>{step.title}</strong><span className="recommendation-detail">{step.detail}</span></div><button className="recommendation-dismiss" onClick={onDismissRecommendation} aria-label="Dismiss recommendation"><X size={15} /></button></div>}
          {step && <button className="button" onClick={() => onNextStep(step)} disabled={starting === 'next'}>{starting === 'next' ? <Loader2 size={16} className="spin" /> : <Play size={16} fill="currentColor" />} {step.kind === 'study_concept' || step.kind === 'resume_session' ? 'Start a focused session' : step.title}</button>}
          {actionError && <p className="form-error" role="alert">{actionError}</p>}
        </div>
        {streak?.show && <div className="lead-note" title={`Longest streak: ${streak.longest} days`}><span className="lead-note-number">{String(streak.current).padStart(2, '0')}</span><span className="lead-note-label">day<br />streak</span><Flame size={20} />{streak.current > 0 && !streak.activeToday && <small className="lead-note-hint">Study today to keep it</small>}</div>}
      </section>

      {cont && <section className="continue-learning">
        <div className="continue-heading"><div><span className="eyebrow">Pick up where you left off</span><h2>Continue learning</h2></div>{cont.courseId && <Link to={`/courses/${cont.courseId}`} className="text-link">Course details <ArrowRight size={15} /></Link>}</div>
        <div className="continue-content">
          <div className="continue-course-mark purple"><BookOpen size={20} /></div>
          <div className="continue-course-copy"><span className="course-tag">{cont.course ?? 'General knowledge'}</span><h3>{cont.topic}</h3><p>{cont.answered} of {cont.planned} questions answered{cont.status === 'completed' ? ' · session complete' : ''}</p><ProgressBar value={Math.round((cont.answered / Math.max(cont.planned, 1)) * 100)} /></div>
          {cont.status === 'completed'
            ? <Link to={`/study/${cont.sessionId}`} className="continue-action"><span>Review session</span><ChevronRight size={19} /></Link>
            : <Link to={`/study/${cont.sessionId}`} className="continue-action"><span>Resume session</span><ChevronRight size={19} /></Link>}
        </div>
      </section>}

      <div className="dashboard-columns">
        <div className="dashboard-main-column">
          <section className="dashboard-section recent-courses"><div className="section-heading"><div><span className="eyebrow">Your active courses</span><h2>Recent courses</h2></div><Link to="/courses" className="text-link">View all <ArrowRight size={15} /></Link></div>
            {data.courses.length ? <div className="editorial-course-list">{data.courses.map((course) => <Link to={`/courses/${course.id}`} className="editorial-course" key={course.id}><div className={`course-icon ${course.color}`}>{course.icon}</div><div className="editorial-course-body"><div className="course-title"><strong>{course.title}</strong><span>{course.category}{course.lessons ? ` · ${course.lessons} concepts` : ''}</span></div><div className="course-progress"><ProgressBar value={course.progress} color={course.color === 'orange' ? 'orange' : course.color === 'green' ? 'green' : 'purple'} /><small>{course.progress}%</small></div><span className="last-activity">{course.lastActivity}</span></div><ChevronRight className="course-chevron" size={17} /></Link>)}</div>
              : <p className="inline-empty">No courses yet. <Link to="/courses">Add one</Link> to study from your own material.</p>}
          </section>

          <section className="dashboard-section practice-section"><div className="section-heading"><div><span className="eyebrow">A little targeted revision</span><h2>Concepts to practice</h2></div><Link to="/progress" className="text-link">See progress <ArrowRight size={15} /></Link></div>
            {data.concepts.length ? <div className="concept-list">{data.concepts.map((concept) => { const courseId = (concept as { courseId?: string }).courseId; return <button className="concept-row" key={concept.id} disabled={Boolean(starting) || !courseId} onClick={() => courseId && onPractice(courseId, concept.id)}><div className={`concept-mark ${concept.color}`}>{starting === concept.id ? <Loader2 size={15} className="spin" /> : <RotateCcw size={15} />}</div><div><strong>{concept.title}</strong><span>{concept.reason}</span><small>{concept.course}</small></div><ChevronRight size={16} /></button> })}</div>
              : <p className="inline-empty">Nothing needs extra practice right now. Concepts appear here when your answers show gaps.</p>}
          </section>
        </div>

        <aside className="dashboard-side-column">
          <section className="dashboard-section streak-section"><div className="section-heading"><div><span className="eyebrow">This week</span><h2>Learning rhythm</h2></div><TrendingUp size={19} className="section-icon" /></div>
            <div className="weekly-chart">{week.map((activity) => <div className={`week-day${activity.isToday ? ' today' : ''}${activity.isFuture ? ' future' : ''}`} key={activity.day}><span className="bar-label">{activity.label}</span><div className="bar-track"><span style={{ height: `${Math.max((activity.minutes / maxActivity) * 100, activity.minutes ? 8 : 2)}%` }} /></div><small>{activity.day}</small></div>)}</div>
            <div className="weekly-total"><strong>{totalTime}</strong><span>studied this week</span>{streak?.show && <i><Flame size={13} /> {streak.current} day streak</i>}</div>
            {data.weekGoal && <div className="week-goal"><span>Weekly goal: <strong>{data.weekGoal.done} of {data.weekGoal.target}</strong> study sessions</span><ProgressBar value={Math.min(100, Math.round((data.weekGoal.done / data.weekGoal.target) * 100))} color="green" /></div>}
          </section>
          <section className="dashboard-section sessions-section"><div className="section-heading"><div><span className="eyebrow">Keep your notes close</span><h2>Recent sessions</h2></div><Clock3 size={19} className="section-icon" /></div>
            {data.sessions.length ? <div className="session-list">{data.sessions.map((session) => <Link to={`/study/${session.id}`} className="session-row" key={session.id}><div className="session-icon"><Check size={15} /></div><div><strong>{session.title}</strong><span>{session.completedAt} · {session.duration}</span></div>{session.score && <em>{session.score}</em>}</Link>)}</div>
              : <p className="inline-empty">Your study sessions will be listed here.</p>}
          </section>
        </aside>
      </div>

      <section className="dashboard-bottom">
        {roadmap
          ? <Link to={roadmap.id ? `/roadmaps/${roadmap.id}` : '/roadmaps'} className="roadmap-preview"><div className="roadmap-preview-icon"><BookOpen size={20} /></div><div className="roadmap-preview-copy"><span className="eyebrow">Your learning roadmap</span><h2>{roadmap.title}</h2><p>{roadmap.progress}% of core topics{roadmap.totalTopics ? ` · ${roadmap.completedTopics ?? 0} of ${roadmap.totalTopics} topics done` : ''}{roadmap.nextTopic ? ` · next: ${roadmap.nextTopic}` : ''}</p><ProgressBar value={roadmap.progress} /></div><ArrowRight size={18} /></Link>
          : <Link to="/roadmaps" className="roadmap-preview"><div className="roadmap-preview-icon"><BookOpen size={20} /></div><div className="roadmap-preview-copy"><span className="eyebrow">Learning roadmaps</span><h2>Choose a roadmap</h2><p>Follow a path toward a role; your study sessions move it forward.</p></div><ArrowRight size={18} /></Link>}
        <Link to="/exams" className="practice-suggestion"><div><span className="eyebrow">Coming up next</span><h2>Try a practice exam</h2><p>{data.examSuggestion ? `Test your ${data.examSuggestion.title} concepts under timed conditions.` : 'Add a course with a few concepts to build a timed practice exam.'}</p></div><div className="suggestion-arrow"><ArrowRight size={18} /></div></Link>
      </section>
    </div>
  )
}
