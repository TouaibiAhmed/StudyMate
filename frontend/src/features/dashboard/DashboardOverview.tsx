import { ArrowRight, BookOpen, Check, ChevronRight, Clock3, Flame, Play, RotateCcw, Target, TrendingUp, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/feedback/EmptyState'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { dashboardService } from '../../services/api-client'
import type { DashboardData } from '../../services/contracts/dashboard'
import { DashboardSkeleton } from './DashboardSkeleton'

export function DashboardOverview() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData>()
  const [loadError, setLoadError] = useState(false)
  const [recommendationVisible, setRecommendationVisible] = useState(true)

  useEffect(() => {
    let active = true
    void dashboardService.getDashboard()
      .then((dashboard) => { if (active) setData(dashboard) })
      .catch(() => { if (active) setLoadError(true) })
    return () => { active = false }
  }, [])

  if (!data && !loadError) return <DashboardSkeleton />
  if (loadError) return <EmptyState title="Your dashboard could not load" text="Please try again from the home link. No study data was changed." />
  if (!data || data.isFirstTime) return <EmptyState title="Your study space is ready" text="Start your first course or study session and your progress will appear here." />

  return <DashboardContent data={data} recommendationVisible={recommendationVisible} onDismissRecommendation={() => setRecommendationVisible(false)} onOpenPractice={(conceptId) => navigate(`/study/concept-${conceptId}`)} />
}

type DashboardContentProps = {
  data: DashboardData
  recommendationVisible: boolean
  onDismissRecommendation: () => void
  onOpenPractice: (conceptId: string) => void
}

function DashboardContent({ data, recommendationVisible, onDismissRecommendation, onOpenPractice }: DashboardContentProps) {
  const maxActivity = useMemo(() => Math.max(...data.weeklyActivity.map(({ minutes }) => minutes), 1), [data.weeklyActivity])
  const totalMinutes = data.weeklyActivity.reduce((total, { minutes }) => total + minutes, 0)
  const totalHours = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`

  return (
    <div className="home-dashboard">
      <section className="dashboard-lead">
        <div className="lead-copy">
          <span className="eyebrow">Tuesday, 12 November · Week 8</span>
          <h2>Good morning, {data.greeting.name}.</h2>
          <p>Let’s make your next study hour count. Your current focus is <strong>{data.greeting.focus}</strong>.</p>
          {recommendationVisible && <div className="recommendation"><div className="recommendation-mark"><Target size={17} /></div><div><span className="eyebrow">Your next best step</span><strong>{data.greeting.recommendation}</strong></div><button className="recommendation-dismiss" onClick={onDismissRecommendation} aria-label="Dismiss recommendation"><X size={15} /></button></div>}
          <Link to="/study/session-react-02" className="button"><Play size={16} fill="currentColor" /> Start a focused session</Link>
        </div>
        <div className="lead-note"><span className="lead-note-number">07</span><span className="lead-note-label">day<br />streak</span><Flame size={20} /></div>
      </section>

      <section className="continue-learning">
        <div className="continue-heading"><div><span className="eyebrow">Pick up where you left off</span><h2>Continue learning</h2></div><Link to="/courses/react" className="text-link">Course details <ArrowRight size={15} /></Link></div>
        <div className="continue-content">
          <div className="continue-course-mark purple">⚛</div>
          <div className="continue-course-copy"><span className="course-tag">Advanced React patterns</span><h3>Compound components</h3><p>Lesson 17 of 24 · about 18 minutes</p><ProgressBar value={68} /><small>68% complete</small></div>
          <Link to="/study/session-react-02" className="continue-action"><span>Resume lesson</span><ChevronRight size={19} /></Link>
        </div>
      </section>

      <div className="dashboard-columns">
        <div className="dashboard-main-column">
          <section className="dashboard-section recent-courses"><div className="section-heading"><div><span className="eyebrow">Your active courses</span><h2>Recent courses</h2></div><Link to="/courses" className="text-link">View all <ArrowRight size={15} /></Link></div><div className="editorial-course-list">{data.courses.map((course) => <Link to={`/courses/${course.id}`} className="editorial-course" key={course.id}><div className={`course-icon ${course.color}`}>{course.icon}</div><div className="editorial-course-body"><div className="course-title"><strong>{course.title}</strong><span>{course.category}</span></div><div className="course-progress"><ProgressBar value={course.progress} color={course.color === 'orange' ? 'orange' : course.color === 'green' ? 'green' : 'purple'} /><small>{course.progress}%</small></div><span className="last-activity">{course.lastActivity}</span></div><ChevronRight className="course-chevron" size={17} /></Link>)}</div></section>

          <section className="dashboard-section practice-section"><div className="section-heading"><div><span className="eyebrow">A little targeted revision</span><h2>Concepts to practice</h2></div><Link to="/progress" className="text-link">See progress <ArrowRight size={15} /></Link></div><div className="concept-list">{data.concepts.map((concept) => <button className="concept-row" key={concept.id} onClick={() => onOpenPractice(concept.id)}><div className={`concept-mark ${concept.color}`}><RotateCcw size={15} /></div><div><strong>{concept.title}</strong><span>{concept.reason}</span><small>{concept.course}</small></div><ChevronRight size={16} /></button>)}</div></section>
        </div>

        <aside className="dashboard-side-column">
          <section className="dashboard-section streak-section"><div className="section-heading"><div><span className="eyebrow">This week</span><h2>Learning rhythm</h2></div><TrendingUp size={19} className="section-icon" /></div><div className="weekly-chart">{data.weeklyActivity.map((activity) => <div className="week-day" key={activity.day}><span className="bar-label">{activity.label}</span><div className="bar-track"><span style={{ height: `${Math.max((activity.minutes / maxActivity) * 100, activity.minutes ? 8 : 2)}%` }} /></div><small>{activity.day}</small></div>)}</div><div className="weekly-total"><strong>{totalHours}</strong><span>studied this week</span><i><Flame size={13} /> 7 day streak</i></div></section>
          <section className="dashboard-section sessions-section"><div className="section-heading"><div><span className="eyebrow">Keep your notes close</span><h2>Recent sessions</h2></div><Clock3 size={19} className="section-icon" /></div><div className="session-list">{data.sessions.map((session) => <Link to={`/study/${session.id}`} className="session-row" key={session.id}><div className="session-icon"><Check size={15} /></div><div><strong>{session.title}</strong><span>{session.completedAt} · {session.duration}</span></div>{session.score && <em>{session.score}</em>}</Link>)}</div></section>
        </aside>
      </div>

      <section className="dashboard-bottom">
        <Link to="/roadmaps/frontend-engineer" className="roadmap-preview"><div className="roadmap-preview-icon"><BookOpen size={20} /></div><div className="roadmap-preview-copy"><span className="eyebrow">Your learning roadmap</span><h2>{data.roadmap.title}</h2><p>{data.roadmap.progress}% complete · Module 7 of {data.roadmap.modules}</p><ProgressBar value={data.roadmap.progress} /></div><ArrowRight size={18} /></Link>
        <Link to="/exams/react-fundamentals" className="practice-suggestion"><div><span className="eyebrow">Coming up next</span><h2>Try a practice exam</h2><p>Test your React fundamentals in 25 minutes.</p></div><div className="suggestion-arrow"><ArrowRight size={18} /></div></Link>
      </section>
    </div>
  )
}
