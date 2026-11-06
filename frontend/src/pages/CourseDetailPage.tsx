import { ArrowLeft, BookOpen, Check, ChevronRight, Clock3, FileText, Play, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { ProgressBar } from '../components/ui/ProgressBar'
import { DocumentUpload } from '../features/courses/DocumentUpload'
import { courseService, documentService } from '../services/api-client'
import type { CourseDetail } from '../services/contracts/courses'
import type { StudyDocument } from '../services/contracts/documents'

export function CourseDetailPage() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState<CourseDetail>()
  const [documents, setDocuments] = useState<StudyDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [documentError, setDocumentError] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let active = true
    if (!courseId) return
    void Promise.all([courseService.getCourse(courseId), documentService.listDocuments(courseId)]).then(([courseData, documentData]) => {
      if (active) {
        setCourse(courseData)
        setDocuments(documentData)
        setLoading(false)
      }
    }).catch(() => { if (active) { setLoadError('This course could not be loaded. Try again from the courses library.'); setLoading(false) } })
    return () => { active = false }
  }, [courseId])

  if (loading) return <CourseDetailSkeleton />
  if (loadError) return <EmptyState title="Course unavailable" text={loadError} action={<Link className="button button-secondary" to="/courses">Back to courses</Link>} />
  if (!course || !courseId) return <EmptyState title="Course not found" text="This course may have been removed or the link is no longer available." action={<Link className="button button-secondary" to="/courses">Back to courses</Link>} />
  const currentCourseId = courseId

  function handleFilesSelected(files: FileList | File[]) {
    setDocumentError('')
    const invalid = Array.from(files).find((file) => !file.name.toLowerCase().endsWith('.pdf'))
    if (invalid) {
      setDocumentError(`${invalid.name} is not a PDF. Choose PDF files only.`)
      return
    }
    void Promise.all(Array.from(files).map((file) => documentService.queueDocument(currentCourseId, file.name, file.size))).then((queued) => setDocuments((current) => [...queued, ...current])).catch(() => setDocumentError('The document could not be queued locally. Try selecting the PDF again.'))
  }

  function handleRemove(documentId: string) {
    void documentService.removeDocument(documentId).then(() => setDocuments((current) => current.filter((document) => document.id !== documentId))).catch(() => setDocumentError('That document could not be removed locally. Try again.'))
  }

  function handleRetry(documentId: string) {
    void documentService.retryDocument(documentId).then((document) => {
      if (document) setDocuments((current) => current.map((item) => item.id === document.id ? document : item))
    }).catch(() => setDocumentError('The mock processing retry failed. Please try again.'))
  }

  return <div className="page-stack course-detail-page">
    <Link to="/courses" className="back-link"><ArrowLeft size={15} /> Back to courses</Link>
    <section className={`course-detail-hero course-detail-${course.color}`}><div className="course-detail-symbol">{course.icon}</div><div className="course-detail-copy"><span className="course-tag">{course.level}</span><span className="eyebrow">{course.subject}</span><h2>{course.title}</h2><p>{course.description}</p><div className="course-detail-meta"><span><BookOpen size={15} /> {course.materialCount} learning materials</span><span><Clock3 size={15} /> Last studied {course.lastStudied}</span></div></div><button className="button course-start-button" onClick={() => navigate(`/study/${course.sessions[0]?.id ?? 'session-general-01'}`)}><Play size={16} fill="currentColor" /> Start studying</button></section>
    <div className="course-detail-grid">
      <div className="course-detail-main">
        <section className="detail-panel concept-progress-panel"><div className="section-heading"><div><span className="eyebrow">What you’re learning</span><h2>Concept progress</h2></div><span className="detail-completion">{course.progress}% complete</span></div><ProgressBar value={course.progress} /><div className="concept-progress-list">{course.concepts.map((concept) => <button className="concept-progress-row" key={concept.id} onClick={() => navigate(`/study/${course.sessions[0]?.id ?? 'session-general-01'}`)}><div><strong>{concept.title}</strong><span>{concept.status} · Study this</span></div><div className="concept-progress-value"><ProgressBar value={concept.progress} color={concept.status === 'Strong' ? 'green' : concept.status === 'Needs review' ? 'orange' : 'purple'} /><small>{concept.progress}%</small></div></button>)}</div></section>
        <section className="detail-panel materials-panel"><div className="section-heading"><div><span className="eyebrow">Your study library</span><h2>Materials</h2></div><span className="materials-count"><FileText size={15} /> {documents.length} files</span></div><DocumentUpload documents={documents} error={documentError} onFilesSelected={handleFilesSelected} onRemove={handleRemove} onRetry={handleRetry} /></section>
      </div>
      <aside className="course-detail-side"><section className="detail-panel sessions-panel"><div className="section-heading"><div><span className="eyebrow">Your study history</span><h2>Recent sessions</h2></div><Clock3 size={18} className="section-icon" /></div><div className="detail-session-list">{course.sessions.map((session) => <Link className="detail-session-row" to={`/study/${session.id}`} key={session.id}><div className="session-icon"><Check size={14} /></div><div><strong>{session.title}</strong><span>{session.date} · {session.duration}</span></div>{session.score && <em>{session.score}</em>}</Link>)}</div>{course.sessions.length === 0 && <p className="documents-empty">No sessions yet. Start your first study block.</p>}</section><Link to="/progress" className="course-next-step"><div className="roadmap-preview-icon"><Target size={19} /></div><div><span className="eyebrow">Keep moving</span><strong>See your full progress</strong><small>Compare this course with your study goals.</small></div><ChevronRight size={17} /></Link></aside>
    </div>
  </div>
}

function CourseDetailSkeleton() {
  return <div className="course-detail-skeleton" role="status" aria-label="Loading course"><span /><div><span /><span /></div><div className="skeleton-columns"><span /><span /></div></div>
}
