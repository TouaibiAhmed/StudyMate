import { ArrowRight, Search } from 'lucide-react'
import { useState } from 'react'
import { ProgressBar } from '../components/ui/ProgressBar'
import { courses } from '../services/mock/data'
export function CoursesPage() {
  const [query, setQuery] = useState('')
  const visible = courses.filter(c => c.title.toLowerCase().includes(query.toLowerCase()))
  return <div className="page-stack"><div className="page-intro"><div><span className="eyebrow">Your library</span><h2>My courses</h2><p>Pick up where you left off or explore something new.</p></div><div className="search-box"><Search size={17} /><input placeholder="Search courses" value={query} onChange={e => setQuery(e.target.value)} /></div></div><div className="course-cards">{visible.map(course => <article className="large-course-card" key={course.id}><div className={`course-banner ${course.color}`}><span className="large-course-icon">{course.icon}</span><span className="course-tag">{course.category}</span></div><div className="large-course-body"><h3>{course.title}</h3><p>Continue learning with practical lessons and guided exercises.</p><div className="course-card-meta"><ProgressBar value={course.progress} /><span>{course.progress}% complete</span></div><button className="text-link">Continue <ArrowRight size={15} /></button></div></article>)}</div></div>
}
