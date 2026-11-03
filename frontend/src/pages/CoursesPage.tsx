import { ArrowRight, BookOpen, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { ProgressBar } from '../components/ui/ProgressBar'
import { CourseCreationDialog } from '../features/courses/CourseCreationDialog'
import { courseService } from '../services/api-client'
import type { CourseSubject, CourseSummary, CreateCourseInput } from '../services/contracts/courses'

const subjects: Array<'All' | CourseSubject> = ['All', 'Deep Learning', 'Statistics', 'Biology', 'Business Fundamentals']

export function CoursesPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState<'All' | CourseSubject>('All')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void courseService.listCourses().then((items) => {
      if (active) {
        setCourses(items)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [])

  const visibleCourses = useMemo(() => courses.filter((course) => {
    const matchesSearch = `${course.title} ${course.description} ${course.subject}`.toLowerCase().includes(query.toLowerCase().trim())
    return matchesSearch && (subject === 'All' || course.subject === subject)
  }), [courses, query, subject])

  function handleCreate(input: CreateCourseInput) {
    void courseService.createCourse(input).then((course) => {
      setCourses((current) => [course, ...current])
      setDialogOpen(false)
    })
  }

  return (
    <div className="page-stack courses-page">
      <div className="page-intro courses-intro"><div><span className="eyebrow">Your learning library</span><h2>Courses</h2><p>Curated paths for curious minds, plus space for your own questions.</p></div><button className="button" onClick={() => setDialogOpen(true)}><Plus size={16} /> Create course</button></div>
      <section className="course-toolbar" aria-label="Course filters"><label className="search-box course-search"><Search size={17} /><input placeholder="Search courses" aria-label="Search courses" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="subject-filters" role="group" aria-label="Filter by subject">{subjects.map((option) => <button key={option} className={subject === option ? 'selected' : ''} onClick={() => setSubject(option)}>{option}</button>)}</div></section>
      {loading ? <CourseListSkeleton /> : visibleCourses.length === 0 ? <EmptyState title="No courses match that search" text="Try another subject or create a course for the question you want to explore." /> : <div className="course-cards course-card-list">{visibleCourses.map((course, index) => <CourseCard course={course} featured={index === 0} key={course.id} />)}</div>}
      <CourseCreationDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSubmit={handleCreate} />
    </div>
  )
}

function CourseCard({ course, featured }: { course: CourseSummary; featured: boolean }) {
  return <Link to={`/courses/${course.id}`} className={`large-course-card course-card-${course.color} ${featured ? 'course-card-featured' : ''}`}>
    <div className={`course-banner ${course.color}`}><span className="large-course-icon">{course.icon}</span><span className="course-tag">{course.level}</span></div>
    <div className="large-course-body"><div className="course-card-heading"><span className="eyebrow">{course.subject}</span><BookOpen size={16} /></div><h3>{course.title}</h3><p>{course.description}</p><div className="course-card-meta"><ProgressBar value={course.progress} color={course.color === 'coral' ? 'orange' : course.color === 'sage' ? 'green' : 'purple'} /><span>{course.progress}% complete</span></div><div className="course-card-footer"><small>{course.completedMaterials} of {course.materialCount || '—'} materials · {course.lastStudied}</small><span className="text-link">Open course <ArrowRight size={15} /></span></div></div>
  </Link>
}

function CourseListSkeleton() {
  return <div className="course-cards course-card-list course-list-skeleton" aria-label="Loading courses" role="status">{[1, 2, 3].map((item) => <div className="large-course-card" key={item}><span /><div><span /><span /><span /></div></div>)}</div>
}
