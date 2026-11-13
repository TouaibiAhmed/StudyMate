import { ArrowRight, BookOpen, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { ProgressBar } from '../components/ui/ProgressBar'
import { CourseCreationDialog } from '../features/courses/CourseCreationDialog'
import { CatalogBrowser } from '../features/catalog/CatalogBrowser'
import { RecommendationStrip } from '../features/recommendations/RecommendationStrip'
import { courseService } from '../services/api-client'
import type { CourseSubject, CourseSummary, CreateCourseInput } from '../services/contracts/courses'
import { isCourseRelevant, prioritizeCourses } from '../services/domain-personalization'
import { preferencesService } from '../services/api-client'
import type { StudentProfile } from '../services/contracts/preferences'

const subjects: Array<'All' | CourseSubject> = ['All', 'Deep Learning', 'Statistics', 'Biology', 'Business Fundamentals']

export function CoursesPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState<'All' | CourseSubject>('All')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [profile, setProfile] = useState<StudentProfile>()
  const [recommendedOnly, setRecommendedOnly] = useState(false)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'discover' || params.get('catalog') ? 'discover' : 'mine'
  const showTab = (next: 'mine' | 'discover') => setParams(next === 'discover' ? { tab: 'discover' } : {})

  function loadCourses(showLoading = true) {
    if (showLoading) { setLoading(true); setError('') }
    void courseService.listCourses().then((items) => {
      setCourses(items)
      setLoading(false)
    }).catch(() => { setError('We could not load your course library. Try again; no course data was changed.'); setLoading(false) })
  }
  useEffect(() => {
    let active = true
    void Promise.all([courseService.listCourses(), preferencesService.getProfile()]).then(([items, currentProfile]) => {
      if (active) { setCourses(items); setProfile(currentProfile); setRecommendedOnly(Boolean(currentProfile.domain)); setLoading(false) }
    }).catch(() => { if (active) { setError('We could not load your course library. Try again; no course data was changed.'); setLoading(false) } })
    return () => { active = false }
  }, [])

  const orderedCourses = useMemo(() => prioritizeCourses(courses, profile), [courses, profile])
  const visibleCourses = useMemo(() => orderedCourses.filter((course) => {
    const matchesSearch = `${course.title} ${course.description} ${course.subject}`.toLowerCase().includes(query.toLowerCase().trim())
    return matchesSearch && (subject === 'All' || course.subject === subject) && (!recommendedOnly || isCourseRelevant(course, profile))
  }), [orderedCourses, query, subject, recommendedOnly, profile])

  function handleCreate(input: CreateCourseInput) {
    setActionError('')
    void courseService.createCourse(input).then((course) => {
      setCourses((current) => [course, ...current])
      setDialogOpen(false)
    }).catch(() => setActionError('We could not create that course locally. Check the form and try again.'))
  }

  return (
    <div className="page-stack courses-page">
      <div className="page-intro courses-intro"><div><span className="eyebrow">Your learning library</span><h2>Courses</h2><p>Curated paths for curious minds, plus space for your own questions.</p></div><button className="button" onClick={() => setDialogOpen(true)}><Plus size={16} /> Create course</button></div>
      <div className="page-tabs" role="tablist" aria-label="Courses"><button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'selected' : ''} onClick={() => showTab('mine')}>My courses</button><button role="tab" aria-selected={tab === 'discover'} className={tab === 'discover' ? 'selected' : ''} onClick={() => showTab('discover')}>Discover</button></div>
      {tab === 'discover' ? <CatalogBrowser highlightId={params.get('catalog')} /> : <>
      <section className="course-toolbar" aria-label="Course filters"><label className="search-box course-search"><Search size={17} /><input placeholder="Search courses" aria-label="Search courses" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="subject-filters" role="group" aria-label="Filter by subject"><button className={recommendedOnly ? 'selected' : ''} onClick={() => setRecommendedOnly(true)} disabled={!profile?.domain}>For you</button><button className={!recommendedOnly && subject === 'All' ? 'selected' : ''} onClick={() => { setRecommendedOnly(false); setSubject('All') }}>All domains</button>{subjects.slice(1).map((option) => <button key={option} className={!recommendedOnly && subject === option ? 'selected' : ''} onClick={() => { setRecommendedOnly(false); setSubject(option) }}>{option}</button>)}</div></section>
      {profile?.domain && recommendedOnly && <p className="personalization-note">Showing courses relevant to <strong>{profile.domain}</strong>{profile.specialization ? ` · ${profile.specialization}` : ''}. <button className="text-button" onClick={() => setRecommendedOnly(false)}>Explore every domain</button></p>}
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      {loading ? <CourseListSkeleton /> : error ? <EmptyState title="Your courses could not load" text={error} action={<button className="button button-secondary"       onClick={() => loadCourses()}>Try again</button>} /> : visibleCourses.length === 0 ? <EmptyState title={courses.length ? 'No courses match that search' : 'No courses yet'} text={courses.length ? 'Try another subject or create a course for the question you want to explore.' : 'Create your first course to start building a focused study library.'} /> : <div className="course-cards course-card-list">{visibleCourses.map((course, index) => <CourseCard course={course} featured={index === 0} key={course.id} />)}</div>}
      {!loading && !error && <RecommendationStrip kind="course" limit={3} onEnrolled={() => loadCourses(false)} />}
      {!loading && !error && <p className="discover-hint"><button className="text-button" onClick={() => showTab('discover')}>Browse the full course catalog</button></p>}
      </>}
      <CourseCreationDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSubmit={handleCreate} />
    </div>
  )
}

function CourseCard({ course, featured }: { course: CourseSummary; featured: boolean }) {
  return <Link to={`/courses/${course.id}`} className={`large-course-card course-card-${course.color} ${featured ? 'course-card-featured' : ''}`}>
    <div className={`course-banner ${course.color}`}><span className="large-course-icon">{course.icon}</span><span className="course-tag">{course.level}</span></div>
    <div className="large-course-body"><div className="course-card-heading"><span className="eyebrow">{course.subject}{course.domain && <span className="course-domain-badge">{course.domain}</span>}</span><BookOpen size={16} /></div><h3>{course.title}</h3><p>{course.description}</p><div className="course-card-meta"><ProgressBar value={course.progress} color={course.color === 'coral' ? 'orange' : course.color === 'sage' ? 'green' : 'purple'} /><span>{course.progress}% complete</span></div><div className="course-card-footer"><small>{course.completedMaterials} of {course.materialCount || '—'} materials · {course.lastStudied}</small><span className="text-link">Open course <ArrowRight size={15} /></span></div></div>
  </Link>
}

function CourseListSkeleton() {
  return <div className="course-cards course-card-list course-list-skeleton" aria-label="Loading courses" role="status">{[1, 2, 3].map((item) => <div className="large-course-card" key={item}><span /><div><span /><span /><span /></div></div>)}</div>
}
