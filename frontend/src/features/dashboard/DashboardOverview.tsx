import { ArrowRight, BookOpen, Flame, Play, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { StatCard } from '../../components/ui/StatCard'
import { studyService } from '../../services/api-client'
import type { DashboardData } from '../../services/contracts/study'

export function DashboardOverview() {
  const [data, setData] = useState<DashboardData>()
  useEffect(() => { void studyService.getDashboard().then(setData) }, [])
  if (!data) return <div className="loading">Preparing your study space…</div>
  return <div className="dashboard-grid">
    <section className="welcome-card"><div><span className="card-kicker">Your learning streak</span><h2>Keep the momentum going.</h2><p>You’re building a great habit. Just one focused session today keeps your streak alive.</p><Button onClick={() => window.location.assign('/study-session')}><Play size={16} fill="currentColor" /> Start studying</Button></div><div className="streak-orbit"><Flame size={31} /><strong>7</strong><span>days</span></div></section>
    <section className="stats-row"><StatCard icon={<Flame size={18} />} label="Current streak" value="7 days" detail="Personal best: 14 days" color="orange" /><StatCard icon={<BookOpen size={18} />} label="Hours studied" value="12.5h" detail="+18% from last week" color="purple" /><StatCard icon={<TrendingUp size={18} />} label="Average score" value="86%" detail="+4% from last week" color="green" /></section>
    <section className="panel courses-panel"><div className="section-heading"><div><span className="eyebrow">Keep learning</span><h2>Continue your courses</h2></div><a href="/courses" className="text-link">View all <ArrowRight size={15} /></a></div><div className="course-list">{data.courses.map(course => <article className="course-row" key={course.id}><div className={`course-icon ${course.color}`}>{course.icon}</div><div className="course-info"><div className="course-title"><strong>{course.title}</strong><span>{course.category}</span></div><div className="course-progress"><ProgressBar value={course.progress} color={course.color === 'orange' ? 'orange' : 'purple'} /><small>{course.completed} of {course.lessons} lessons</small></div></div><strong className="percentage">{course.progress}%</strong><button className="round-arrow" aria-label={`Continue ${course.title}`}><ArrowRight size={16} /></button></article>)}</div></section>
    <section className="panel activity-panel"><div className="section-heading"><div><span className="eyebrow">Your activity</span><h2>Recent activity</h2></div><button className="icon-button"><ArrowRight size={17} /></button></div><div className="activity-list">{data.activity.map(item => <div className="activity-item" key={item.title}><div className={`activity-icon ${item.color}`}>{item.icon}</div><div><strong>{item.title}</strong><span>{item.detail}</span></div><time>{item.time}</time></div>)}</div></section>
  </div>
}
