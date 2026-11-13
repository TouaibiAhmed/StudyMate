import { ArrowLeft, Check, FileText, LoaderCircle, Play, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { useAuth } from '../features/auth/hooks/useAuth'
import { useAiOperation } from '../hooks/useAiOperation'
import { courseService, documentService, studyToolsService } from '../services/api-client'
import type { CourseDetail } from '../services/contracts/courses'
import type { StudyDocument } from '../services/contracts/documents'
import type { Quiz, QuizDifficulty, QuizQuestionType } from '../services/contracts/study-tools'

const questionCounts = [5, 10, 15, 20]
const difficulties: QuizDifficulty[] = ['Easy', 'Medium', 'Hard', 'Mixed']
const questionTypes: QuizQuestionType[] = ['Multiple Choice', 'True/False', 'Short Answer']
const languages = ['English', 'French', 'Arabic', 'Spanish']

export function QuizGeneratorPage() {
  const { courseId, quizId = 'new' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [course, setCourse] = useState<CourseDetail>()
  const [documents, setDocuments] = useState<StudyDocument[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [count, setCount] = useState(5)
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('Mixed')
  const [selectedTypes, setSelectedTypes] = useState<QuizQuestionType[]>(['Multiple Choice', 'True/False'])
  const [language, setLanguage] = useState(user?.preferredLanguage || 'English')
  const generateOp = useAiOperation<Quiz>({ processingAfterMs: 4_000 })
  const [generationStage, setGenerationStage] = useState('')
  const [quiz, setQuiz] = useState<Quiz>()

  useEffect(() => {
    if (!courseId) return
    void Promise.all([courseService.getCourse(courseId), documentService.listDocuments(courseId), studyToolsService.listQuizzes(courseId)]).then(([courseData, documentData, quizData]) => {
      setCourse(courseData)
      setDocuments(documentData)
      setQuizzes(quizData)
      const requested = quizData.find((item) => item.id === quizId)
      if (requested) setQuiz(requested)
      else setSelectedSources(documentData.filter((document) => document.status === 'Ready').map((document) => document.id))
    })
  }, [courseId, quizId])

  const readyDocuments = useMemo(() => documents.filter((document) => document.status === 'Ready'), [documents])
  if (!courseId) return <EmptyState title="Course not found" text="Choose a course before creating a quiz." action={<Link className="button" to="/courses">Back to courses</Link>} />
  if (!course) return <div className="summary-page-loading"><LoaderCircle className="spin" size={22} /> Loading quiz workspace…</div>
  const activeCourseId = courseId

  function toggleSource(id: string) { setSelectedSources((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  function toggleTopic(id: string) { setSelectedTopics((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  function toggleType(type: QuizQuestionType) { setSelectedTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]) }
  async function generate() {
    if (!selectedSources.length || !selectedTypes.length) return
    const result = await generateOp.run(() =>
      studyToolsService.generateQuiz(activeCourseId, { sourceDocumentIds: selectedSources, topicIds: selectedTopics, questionCount: count, difficulty, questionTypes: selectedTypes, language }, (p) => setGenerationStage(p.stage ?? '')),
    )
    if (result) {
      setQuizzes((current) => [result, ...current])
      setQuiz(result)
      navigate(`/courses/${activeCourseId}/quizzes/${result.id}`, { replace: true })
    }
  }

  return <div className="page-stack summary-page">
    <Link to={`/courses/${activeCourseId}`} className="back-link"><ArrowLeft size={15} /> Back to {course.title}</Link>
    <div className="summary-page-header"><div><span className="eyebrow">{quiz?.isMock ? 'Study tools · Mock demo' : 'Study tools'}</span><h1>{quiz ? 'Quiz preview' : 'Build a practice quiz'}</h1><p>{quiz ? 'Review the generated questions before using them for practice.' : 'Choose sources, focus areas, and question settings.'}</p></div>{quiz?.isMock && <span className="mock-badge">Predefined mock questions</span>}</div>
    {quiz ? <QuizPreview quiz={quiz} documents={documents} onNew={() => { setQuiz(undefined); navigate(`/courses/${activeCourseId}/quizzes/new`, { replace: true }) }} /> : <div className="summary-builder-grid"><section className="detail-panel summary-builder-panel"><div className="section-heading"><div><span className="eyebrow">1 · Sources</span><h2>Course material</h2></div><span className="source-count">{selectedSources.length} selected</span></div><label className="all-source-option"><input type="checkbox" checked={selectedSources.length === readyDocuments.length && readyDocuments.length > 0} onChange={(event) => setSelectedSources(event.target.checked ? readyDocuments.map((document) => document.id) : [])} /><span><strong>All available course material</strong><small>Include every ready platform and uploaded document.</small></span></label><div className="summary-source-list">{documents.map((document) => <label className={`summary-source-row ${document.status !== 'Ready' ? 'unavailable' : ''}`} key={document.id}><input type="checkbox" disabled={document.status !== 'Ready'} checked={selectedSources.includes(document.id)} onChange={() => toggleSource(document.id)} /><FileText size={17} /><span><strong>{document.fileName}</strong><small>{document.source === 'platform-material' ? 'Platform-provided' : 'Your upload'} · {document.status}</small></span>{document.status === 'Ready' && <Check size={15} />}</label>)}</div><div className="summary-topics"><div className="section-heading"><div><span className="eyebrow">Optional focus</span><h3>Topics or chapters</h3></div></div><div className="topic-chips">{course.concepts.map((concept) => <label className={selectedTopics.includes(concept.id) ? 'selected' : ''} key={concept.id}><input type="checkbox" checked={selectedTopics.includes(concept.id)} onChange={() => toggleTopic(concept.id)} />{concept.title}</label>)}</div></div></section><section className="detail-panel summary-options-panel"><div className="section-heading"><div><span className="eyebrow">2 · Configure</span><h2>Quiz settings</h2></div></div><fieldset><legend>Number of questions</legend><div className="option-pills">{questionCounts.map((value) => <button className={count === value ? 'selected' : ''} key={value} onClick={() => setCount(value)}>{value}</button>)}</div></fieldset><fieldset><legend>Difficulty</legend><div className="option-pills">{difficulties.map((value) => <button className={difficulty === value ? 'selected' : ''} key={value} onClick={() => setDifficulty(value)}>{value}</button>)}</div></fieldset><fieldset><legend>Question types</legend><div className="structure-options">{questionTypes.map((type) => <label key={type}><input type="checkbox" checked={selectedTypes.includes(type)} onChange={() => toggleType(type)} />{type}</label>)}</div></fieldset><label className="summary-select">Language<select value={language} onChange={(event) => setLanguage(event.target.value)}>{languages.map((option) => <option key={option}>{option}</option>)}</select></label>{!selectedSources.length && <p className="form-error" role="alert">Select at least one ready course source.</p>}{!selectedTypes.length && <p className="form-error" role="alert">Select at least one question type.</p>}{generateOp.state.error && <p className="form-error" role="alert">{generateOp.state.error}{generateOp.state.retryable && <> <button className="button button-ghost" onClick={() => void generate()} disabled={generateOp.busy}>Try again</button></>}</p>}<button className="button summary-generate-button" disabled={generateOp.busy || !selectedSources.length || !selectedTypes.length} onClick={() => void generate()}>{generateOp.busy ? <>{generateOp.state.status === 'processing' ? <><LoaderCircle className="spin" size={16} /> {generationStage || 'Still working…'}</> : <><LoaderCircle className="spin" size={16} /> Preparing quiz…</>}</> : <><Save size={16} /> Generate quiz</>}</button></section></div>}
    {generateOp.busy && <p className="generation-note" role="status">{generationStage || 'Starting…'} · Generation runs on the local AI model and can take several minutes. You can leave this page: it will appear under Saved work when ready.</p>}
    {!quiz && quizzes.length > 0 && <section className="detail-panel summary-history-panel"><div className="section-heading"><div><span className="eyebrow">Saved work</span><h2>Saved quizzes</h2></div><span className="source-count">{quizzes.length}</span></div><div className="summary-history-list">{quizzes.map((item) => <button key={item.id} disabled={Boolean(item.status && item.status !== 'ready')} onClick={() => navigate(`/courses/${activeCourseId}/quizzes/${item.id}`)}><Play size={17} /><span><strong>{item.title}</strong><small>{item.questionCount} questions · {item.difficulty} · {item.language}{item.status && item.status !== 'ready' ? <em className="generation-status">{item.status === 'failed' ? ' · Failed' : ` · Generating${item.stage ? ` (${item.stage})` : ''}…`}</em> : null}</small></span></button>)}</div></section>}
  </div>
}

function QuizPreview({ quiz, documents, onNew }: { quiz: Quiz; documents: StudyDocument[]; onNew: () => void }) {
  const sourceNames = quiz.sourceDocumentIds.map((id) => documents.find((document) => document.id === id)?.fileName).filter(Boolean)
  return <div className="quiz-preview-layout"><article className="summary-reading-panel"><div className="summary-reading-meta">{quiz.isMock && <span className="mock-badge">Mock / demo</span>}<span>{quiz.questionCount} questions · {quiz.difficulty} · {quiz.language}</span></div><h2>{quiz.title}</h2>{quiz.isMock && <p className="summary-disclaimer">These questions are predefined practice content. They do not claim to be generated from or extracted from your uploaded files.</p>}<div className="quiz-preview-actions"><Link className="button" to={`/courses/${quiz.courseId}/quizzes/${quiz.id}/play`}><Play size={16} /> Start quiz</Link><button className="button button-ghost" onClick={onNew}>Build another quiz</button></div>{quiz.questions.map((question, index) => <section className="quiz-question-card" key={question.id}><div><span className="eyebrow">Question {index + 1} · {question.type}</span><h3>{question.prompt}</h3></div>{question.options && <div className="quiz-options">{question.options.map((option) => <span key={option}>{option}</span>)}</div>}{question.type === 'Short Answer' && <div className="quiz-answer-line">Write your answer here…</div>}</section>)}</article><aside className="summary-reader-aside"><div className="detail-panel summary-sources-card"><span className="eyebrow">Sources used</span>{sourceNames.map((name) => <span key={name}><FileText size={14} />{name}</span>)}<small>{quiz.sourceLabel}</small><small>Topics: {quiz.topicIds.length || 'all course topics'}</small></div></aside></div>
}
