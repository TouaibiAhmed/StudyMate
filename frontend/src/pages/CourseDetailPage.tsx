import { ArrowLeft, BookOpen, Check, ChevronRight, Clock3, FileText, Play, Plus, Target, Trash2, WandSparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { ProgressBar } from '../components/ui/ProgressBar'
import { DocumentUpload } from '../features/courses/DocumentUpload'
import { courseService, documentService, studyToolsService } from '../services/api-client'
import type { CourseDetail } from '../services/contracts/courses'
import type { StudyDocument } from '../services/contracts/documents'
import type { Quiz, Summary } from '../services/contracts/study-tools'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

export function CourseDetailPage() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState<CourseDetail>()
  const [documents, setDocuments] = useState<StudyDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [documentError, setDocumentError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [toolsLoading, setToolsLoading] = useState(true)
  const [toolsError, setToolsError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletingCourse, setDeletingCourse] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  function refreshConcepts(id: string) {
    if (courseService.getConcepts) {
      void courseService.getConcepts(id).then((concepts) => {
        setCourse((prev) => (prev ? { ...prev, concepts } : prev))
      }).catch(() => {})
    }
  }

  useEffect(() => {
    let active = true
    if (!courseId) return
    const controller = new AbortController()
    abortControllerRef.current = controller

    void Promise.all([courseService.getCourse(courseId), documentService.listDocuments(courseId)]).then(([courseData, documentData]) => {
      if (active) {
        setCourse(courseData)
        setDocuments(documentData)
        setLoading(false)

        // Poll any documents already in Queued or Processing state
        documentData.forEach((doc) => {
          if ((doc.status === 'Queued' || doc.status === 'Processing') && documentService.pollDocumentStatus) {
            void documentService.pollDocumentStatus(doc.id, (updated) => {
              if (!active) return
              setDocuments((curr) => curr.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)))
              if (updated.status === 'Ready') refreshConcepts(courseId)
            }, controller.signal)
          }
        })
      }
      void Promise.all([studyToolsService.listSummaries(courseId), studyToolsService.listQuizzes(courseId)]).then(([summaryData, quizData]) => {
        if (active) {
          setSummaries(summaryData)
          setQuizzes(quizData)
          setToolsLoading(false)
        }
      }).catch(() => {
        if (active) {
          setToolsError('Saved study tools could not be loaded. Try refreshing this course.')
          setToolsLoading(false)
        }
      })
    }).catch(() => {
      if (active) {
        setLoadError('This course could not be loaded. Try again from the courses library.')
        setLoading(false)
      }
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [courseId])

  if (loading) return <CourseDetailSkeleton />
  if (loadError) return <EmptyState title="Course unavailable" text={loadError} action={<Link className="button button-secondary" to="/courses">Back to courses</Link>} />
  if (!course || !courseId) return <EmptyState title="Course not found" text="This course may have been removed or the link is no longer available." action={<Link className="button button-secondary" to="/courses">Back to courses</Link>} />
  const currentCourseId = courseId

  function handleFilesSelected(files: FileList | File[]) {
    setDocumentError('')
    const fileList = Array.from(files)

    const invalidType = fileList.find((file) => !file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf')
    if (invalidType) {
      setDocumentError(`${invalidType.name} is not a PDF. Please choose PDF course files only.`)
      return
    }

    const oversized = fileList.find((file) => file.size > MAX_FILE_SIZE)
    if (oversized) {
      setDocumentError(`${oversized.name} exceeds the maximum 25 MB limit. Please select a smaller PDF.`)
      return
    }

    const controller = abortControllerRef.current || new AbortController()

    void Promise.all(
      fileList.map(async (file) => {
        if (documentService.uploadDocument) {
          return documentService.uploadDocument(currentCourseId, file)
        }
        return documentService.queueDocument(currentCourseId, file.name, file.size)
      })
    ).then((queued) => {
      setDocuments((current) => [...queued, ...current])

      // Begin polling for each newly uploaded document
      queued.forEach((doc) => {
        if ((doc.status === 'Queued' || doc.status === 'Processing') && documentService.pollDocumentStatus) {
          void documentService.pollDocumentStatus(doc.id, (updated) => {
            setDocuments((current) => current.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)))
            if (updated.status === 'Ready') {
              refreshConcepts(currentCourseId)
            }
          }, controller.signal)
        }
      })
    }).catch((err) => {
      const message = err instanceof Error ? err.message : 'The document could not be uploaded. Check your file and try again.'
      setDocumentError(message)
    })
  }

  function handleRemove(documentId: string) {
    void documentService.removeDocument(documentId).then(() => {
      setDocuments((current) => current.filter((document) => document.id !== documentId))
    }).catch(() => setDocumentError('That document could not be removed. Try again.'))
  }

  function handleRetry(documentId: string) {
    void documentService.retryDocument(documentId).then((document) => {
      if (document) {
        setDocuments((current) => current.map((item) => item.id === document.id ? document : item))
        if ((document.status === 'Queued' || document.status === 'Processing') && documentService.pollDocumentStatus) {
          const controller = abortControllerRef.current || new AbortController()
          void documentService.pollDocumentStatus(document.id, (updated) => {
            setDocuments((current) => current.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)))
            if (updated.status === 'Ready') refreshConcepts(currentCourseId)
          }, controller.signal)
        }
      }
    }).catch(() => setDocumentError('The retry could not be started. Please try again.'))
  }

  async function handleDeleteCourse() {
    setDeletingCourse(true)
    try {
      await courseService.deleteCourse(currentCourseId)
      navigate('/courses', { replace: true })
    } catch {
      setDocumentError('The course could not be deleted. Please try again.')
      setDeletingCourse(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="page-stack course-detail-page">
      <div className="course-detail-top-nav">
        <Link to="/courses" className="back-link"><ArrowLeft size={15} /> Back to courses</Link>
        {confirmDelete ? (
          <span className="course-delete-confirm">
            <span>Delete this course and its data?</span>
            <button className="button button-danger-inline" onClick={() => void handleDeleteCourse()} disabled={deletingCourse}>
              {deletingCourse ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button className="button button-ghost-inline" onClick={() => setConfirmDelete(false)} disabled={deletingCourse}>
              Cancel
            </button>
          </span>
        ) : (
          <button className="text-button course-delete-button" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} /> Delete course
          </button>
        )}
      </div>

      <section className={`course-detail-hero course-detail-${course.color}`}>
        <div className="course-detail-symbol">{course.icon}</div>
        <div className="course-detail-copy">
          <span className="course-tag">{course.level}</span>
          <span className="eyebrow">{course.subject}</span>
          <h2>{course.title}</h2>
          <p>{course.description}</p>
          <div className="course-detail-meta">
            <span><BookOpen size={15} /> {course.materialCount} learning materials</span>
            <span><Clock3 size={15} /> Last studied {course.lastStudied}</span>
          </div>
        </div>
        <button className="button course-start-button" onClick={() => navigate(`/study/${course.sessions[0]?.id ?? 'session-general-01'}`)}>
          <Play size={16} fill="currentColor" /> Start studying
        </button>
      </section>

      <div className="course-detail-grid">
        <div className="course-detail-main">
          <section className="detail-panel concept-progress-panel">
            <div className="section-heading">
              <div><span className="eyebrow">What you’re learning</span><h2>Concept progress</h2></div>
              <span className="detail-completion">{course.progress}% complete</span>
            </div>
            <ProgressBar value={course.progress} />
            <div className="concept-progress-list">
              {course.concepts.map((concept) => (
                <button className="concept-progress-row" key={concept.id} onClick={() => navigate(`/study/${course.sessions[0]?.id ?? 'session-general-01'}`)}>
                  <div>
                    <strong>{concept.title}</strong>
                    <span>{concept.status} · Study this</span>
                  </div>
                  <div className="concept-progress-value">
                    <ProgressBar value={concept.progress} color={concept.status === 'Strong' ? 'green' : concept.status === 'Needs review' ? 'orange' : 'purple'} />
                    <small>{concept.progress}%</small>
                  </div>
                </button>
              ))}
              {course.concepts.length === 0 && (
                <p className="documents-empty">No course concepts extracted yet. Upload a PDF lecture or note to discover key concepts.</p>
              )}
            </div>
          </section>

          <section className="detail-panel materials-panel">
            <div className="section-heading">
              <div><span className="eyebrow">Your study library</span><h2>Materials</h2></div>
              <span className="materials-count"><FileText size={15} /> {documents.length} files</span>
            </div>
            <DocumentUpload documents={documents} error={documentError} onFilesSelected={handleFilesSelected} onRemove={handleRemove} onRetry={handleRetry} />
          </section>

          <StudyToolsPanel courseId={currentCourseId} summaries={summaries} quizzes={quizzes} loading={toolsLoading} error={toolsError} onDeleteQuiz={(quizId) => { void studyToolsService.deleteQuiz(quizId).then(() => setQuizzes((current) => current.filter((quiz) => quiz.id !== quizId))) }} onRenameQuiz={(quizId, title) => { void studyToolsService.updateQuiz(quizId, { title }).then((updated) => { if (updated) setQuizzes((current) => current.map((quiz) => quiz.id === quizId ? updated : quiz)) }) }} />
        </div>

        <aside className="course-detail-side">
          <section className="detail-panel sessions-panel">
            <div className="section-heading">
              <div><span className="eyebrow">Your study history</span><h2>Recent sessions</h2></div>
              <Clock3 size={18} className="section-icon" />
            </div>
            <div className="detail-session-list">
              {course.sessions.map((session) => (
                <Link className="detail-session-row" to={`/study/${session.id}`} key={session.id}>
                  <div className="session-icon"><Check size={14} /></div>
                  <div><strong>{session.title}</strong><span>{session.date} · {session.duration}</span></div>
                  {session.score && <em>{session.score}</em>}
                </Link>
              ))}
            </div>
            {course.sessions.length === 0 && <p className="documents-empty">No sessions yet. Start your first study block.</p>}
          </section>

          <Link to="/progress" className="course-next-step">
            <div className="roadmap-preview-icon"><Target size={19} /></div>
            <div>
              <span className="eyebrow">Keep moving</span>
              <strong>See your full progress</strong>
              <small>Compare this course with your study goals.</small>
            </div>
            <ChevronRight size={17} />
          </Link>
        </aside>
      </div>
    </div>
  )
}

function StudyToolsPanel({ courseId, summaries, quizzes, loading, error, onDeleteQuiz, onRenameQuiz }: { courseId: string; summaries: Summary[]; quizzes: Quiz[]; loading: boolean; error: string; onDeleteQuiz: (id: string) => void; onRenameQuiz: (id: string, title: string) => void }) {
  return (
    <section className="detail-panel study-tools-panel">
      <div className="study-tools-heading">
        <div>
          <span className="eyebrow">Study tools</span>
          <h2>Turn materials into momentum</h2>
          <p>Prepare a summary or quiz from the course sources you choose.</p>
        </div>
        <WandSparkles size={21} />
      </div>
      <div className="study-tool-actions">
        <Link className="study-tool-action summary" to={`/courses/${courseId}/summaries/new`}>
          <span><FileText size={20} /></span>
          <div><strong>Generate summary</strong><small>Condense the key ideas from selected sources.</small></div>
          <Plus size={16} />
        </Link>
        <Link className="study-tool-action quiz" to={`/courses/${courseId}/quizzes/new`}>
          <span><Target size={20} /></span>
          <div><strong>Generate quiz</strong><small>Create a practice set from selected sources.</small></div>
          <Plus size={16} />
        </Link>
      </div>
      {loading ? <div className="study-tools-empty" role="status">Loading saved study tools…</div> : error ? <div className="study-tools-empty" role="alert">{error}</div> : (
        <div className="saved-tools-grid">
          <SavedSummaryGroup summaries={summaries} />
          <SavedQuizGroup quizzes={quizzes} onDelete={onDeleteQuiz} onRename={onRenameQuiz} />
        </div>
      )}
    </section>
  )
}

function SavedSummaryGroup({ summaries }: { summaries: Summary[] }) {
  return (
    <div className="saved-tool-group">
      <div className="saved-tool-title"><h3>Saved summaries</h3><span>{summaries.length}</span></div>
      {summaries.length ? summaries.map((summary) => (
        <Link className="saved-tool-card" key={summary.id} to={`/courses/${summary.courseId}/summaries/${summary.id}`}>
          <strong>{summary.title}</strong>
          <span>{formatToolDate(summary.createdAt)} · {summary.sourceLabel}</span>
          <small>{summary.length} · {summary.language} · {summary.structure}</small>
        </Link>
      )) : (
        <div className="study-tools-empty"><span>No summaries yet.</span><small>Choose the tool above to generate one.</small></div>
      )}
    </div>
  )
}

function SavedQuizGroup({ quizzes, onDelete, onRename }: { quizzes: Quiz[]; onDelete: (id: string) => void; onRename: (id: string, title: string) => void }) {
  const [editing, setEditing] = useState<string>()
  const [title, setTitle] = useState('')
  const [confirming, setConfirming] = useState<string>()

  return (
    <div className="saved-tool-group">
      <div className="saved-tool-title"><h3>Saved quizzes</h3><span>{quizzes.length}</span></div>
      {quizzes.length ? quizzes.map((quiz) => (
        <div className="saved-tool-card saved-quiz-card" key={quiz.id}>
          <Link to={`/courses/${quiz.courseId}/quizzes/${quiz.id}`}>
            <strong>{quiz.title}</strong>
            <span>{formatToolDate(quiz.createdAt)} · {quiz.sourceLabel}</span>
            <small>{quiz.questionCount} questions · {quiz.difficulty} · {quiz.language}</small>
          </Link>
          <Link className="saved-tool-retake" to={`/courses/${quiz.courseId}/quizzes/${quiz.id}/play`}>Retake quiz</Link>
          {editing === quiz.id ? (
            <div className="saved-tool-edit">
              <input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Quiz title" />
              <button onClick={() => { onRename(quiz.id, title.trim() || quiz.title); setEditing(undefined) }}>Save</button>
            </div>
          ) : (
            <div className="saved-tool-manage">
              <button onClick={() => { setEditing(quiz.id); setTitle(quiz.title) }}>Rename</button>
              {confirming === quiz.id ? (
                <>
                  <span>Delete?</span>
                  <button onClick={() => onDelete(quiz.id)}>Yes</button>
                  <button onClick={() => setConfirming(undefined)}>No</button>
                </>
              ) : (
                <button onClick={() => setConfirming(quiz.id)}>Delete</button>
              )}
            </div>
          )}
        </div>
      )) : (
        <div className="study-tools-empty"><span>No quizzes yet.</span><small>Choose the tool above to generate one.</small></div>
      )}
    </div>
  )
}

function formatToolDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
  } catch {
    return value
  }
}

function CourseDetailSkeleton() {
  return (
    <div className="course-detail-skeleton" role="status" aria-label="Loading course">
      <span />
      <div><span /><span /></div>
      <div className="skeleton-columns"><span /><span /></div>
    </div>
  )
}
