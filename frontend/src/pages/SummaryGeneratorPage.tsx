import { ArrowLeft, Check, Clipboard, FileText, LoaderCircle, Pencil, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { useAuth } from '../features/auth/hooks/useAuth'
import { courseService, documentService, studyToolsService } from '../services/api-client'
import type { CourseDetail } from '../services/contracts/courses'
import type { StudyDocument } from '../services/contracts/documents'
import type { Summary, SummaryLength, SummaryStructure } from '../services/contracts/study-tools'

const lengths: SummaryLength[] = ['Short', 'Medium', 'Detailed']
const structures: SummaryStructure[] = ['Key Concepts', 'Definitions', 'Important Points', 'Chapter-by-Chapter']
const languages = ['English', 'French', 'Arabic', 'Spanish']

export function SummaryGeneratorPage() {
  const { courseId, summaryId = 'new' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [course, setCourse] = useState<CourseDetail>()
  const [documents, setDocuments] = useState<StudyDocument[]>([])
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([])
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [length, setLength] = useState<SummaryLength>('Medium')
  const [language, setLanguage] = useState(user?.preferredLanguage || 'English')
  const [structure, setStructure] = useState<SummaryStructure>('Key Concepts')
  const [status, setStatus] = useState<'idle' | 'generating'>('idle')
  const [error, setError] = useState('')
  const [reading, setReading] = useState<Summary>()
  const [renameValue, setRenameValue] = useState('')
  const [copyMessage, setCopyMessage] = useState('')

  useEffect(() => {
    if (!courseId) return
    void Promise.all([courseService.getCourse(courseId), documentService.listDocuments(courseId), studyToolsService.listSummaries(courseId)]).then(([courseData, documentData, summaryData]) => {
      setCourse(courseData)
      setDocuments(documentData)
      setSummaries(summaryData)
      const requested = summaryData.find((summary) => summary.id === summaryId)
      if (requested) {
        setReading(requested)
        setRenameValue(requested.title)
      } else {
        setSelectedDocuments(documentData.filter((document) => document.status === 'Ready').map((document) => document.id))
      }
    })
  }, [courseId, summaryId])

  const readyDocuments = useMemo(() => documents.filter((document) => document.status === 'Ready'), [documents])
  if (!courseId) return <EmptyState title="Course not found" text="Choose a course before creating a summary." action={<Link className="button" to="/courses">Back to courses</Link>} />
  if (!course) return <div className="summary-page-loading"><LoaderCircle className="spin" size={22} /> Loading summary workspace…</div>
  const activeCourseId = courseId

  function toggleDocument(id: string) {
    setSelectedDocuments((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }
  function toggleTopic(id: string) {
    setSelectedTopics((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }
  async function generate() {
    if (!selectedDocuments.length) {
      setError('Select at least one ready source document before generating.')
      return
    }
    setError('')
    setStatus('generating')
    await new Promise((resolve) => window.setTimeout(resolve, 900))
    const result = await studyToolsService.generateSummary(activeCourseId, { sourceDocumentIds: selectedDocuments, topicIds: selectedTopics, length, language, structure })
    setSummaries((current) => [result, ...current])
    setReading(result)
    setRenameValue(result.title)
    setStatus('idle')
    navigate(`/courses/${courseId}/summaries/${result.id}`, { replace: true })
  }
  async function rename() {
    if (!reading || !renameValue.trim()) return
    const updated = await studyToolsService.updateSummary(reading.id, { title: renameValue.trim() })
    if (updated) {
      setReading(updated)
      setSummaries((current) => current.map((summary) => summary.id === updated.id ? updated : summary))
    }
  }
  async function remove() {
    if (!reading) return
    await studyToolsService.deleteSummary(reading.id)
    setSummaries((current) => current.filter((summary) => summary.id !== reading.id))
    setReading(undefined)
    navigate(`/courses/${courseId}/summaries/new`, { replace: true })
  }
  async function copy() {
    if (!reading) return
    const text = reading.sections.map((section) => `${section.heading}\n${section.points.map((point) => `• ${point}`).join('\n')}`).join('\n\n')
    await navigator.clipboard?.writeText(`${reading.title}\n\n${text}`)
    setCopyMessage('Summary copied')
    window.setTimeout(() => setCopyMessage(''), 1800)
  }

  return <div className="page-stack summary-page">
    <Link to={`/courses/${courseId}`} className="back-link"><ArrowLeft size={15} /> Back to {course.title}</Link>
    <div className="summary-page-header"><div><span className="eyebrow">Study tools · Mock demo</span><h1>{reading ? 'Summary reader' : 'Build a course summary'}</h1><p>{reading ? 'Read, refine, and keep a lightweight revision scaffold.' : 'Choose the material and shape you want. Uploaded files are shown as sources only; they are not extracted or analysed.'}</p></div><span className="mock-badge">Predefined mock content</span></div>
    {reading ? <SummaryReader summary={reading} documents={documents} renameValue={renameValue} copyMessage={copyMessage} onRenameValue={setRenameValue} onRename={() => void rename()} onCopy={() => void copy()} onDelete={() => void remove()} onNew={() => { setReading(undefined); navigate(`/courses/${courseId}/summaries/new`, { replace: true }) }} /> : <div className="summary-builder-grid"><section className="detail-panel summary-builder-panel"><div className="section-heading"><div><span className="eyebrow">1 · Sources</span><h2>What should we use?</h2></div><span className="source-count">{selectedDocuments.length} selected</span></div><label className="all-source-option"><input type="checkbox" checked={selectedDocuments.length === readyDocuments.length && readyDocuments.length > 0} onChange={(event) => setSelectedDocuments(event.target.checked ? readyDocuments.map((document) => document.id) : [])} /><span><strong>All available course material</strong><small>Include every ready platform and uploaded document.</small></span></label><div className="summary-source-list">{documents.map((document) => <label className={`summary-source-row ${document.status !== 'Ready' ? 'unavailable' : ''}`} key={document.id}><input type="checkbox" disabled={document.status !== 'Ready'} checked={selectedDocuments.includes(document.id)} onChange={() => toggleDocument(document.id)} /><FileText size={17} /><span><strong>{document.fileName}</strong><small>{document.source === 'platform-material' ? 'Platform-provided' : 'Your upload'} · {document.status}</small></span>{document.status === 'Ready' && <Check size={15} />}</label>)}</div><div className="summary-topics"><div className="section-heading"><div><span className="eyebrow">Optional focus</span><h3>Chapters or topics</h3></div></div><div className="topic-chips">{course.concepts.map((concept) => <label key={concept.id} className={selectedTopics.includes(concept.id) ? 'selected' : ''}><input type="checkbox" checked={selectedTopics.includes(concept.id)} onChange={() => toggleTopic(concept.id)} />{concept.title}</label>)}</div></div></section><section className="detail-panel summary-options-panel"><div className="section-heading"><div><span className="eyebrow">2 · Shape the result</span><h2>Generation options</h2></div></div><fieldset><legend>Summary length</legend><div className="option-pills">{lengths.map((option) => <button className={length === option ? 'selected' : ''} key={option} onClick={() => setLength(option)}>{option}</button>)}</div></fieldset><label className="summary-select">Language<select value={language} onChange={(event) => setLanguage(event.target.value)}>{languages.map((option) => <option key={option}>{option}</option>)}</select></label><fieldset><legend>Structure</legend><div className="structure-options">{structures.map((option) => <label key={option}><input type="radio" name="structure" checked={structure === option} onChange={() => setStructure(option)} />{option}</label>)}</div></fieldset>{selectedTopics.length > 0 && <p className="summary-focus-note">Focused on {selectedTopics.length} selected topic{selectedTopics.length === 1 ? '' : 's'}.</p>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button summary-generate-button" disabled={status === 'generating'} onClick={() => void generate()}>{status === 'generating' ? <><LoaderCircle className="spin" size={16} /> Preparing mock summary…</> : <><Save size={16} /> Generate summary</>}</button><p className="study-tool-note">Demo safeguard: no document text is sent anywhere and no real AI generation takes place.</p></section></div>}
    {!reading && summaries.length > 0 && <section className="detail-panel summary-history-panel"><div className="section-heading"><div><span className="eyebrow">Saved work</span><h2>Your summaries</h2></div><span className="source-count">{summaries.length}</span></div><div className="summary-history-list">{summaries.map((summary) => <button key={summary.id} onClick={() => navigate(`/courses/${courseId}/summaries/${summary.id}`)}><FileText size={17} /><span><strong>{summary.title}</strong><small>{summary.sourceLabel} · {summary.length} · {summary.language}</small></span></button>)}</div></section>}
  </div>
}

function SummaryReader({ summary, documents, renameValue, copyMessage, onRenameValue, onRename, onCopy, onDelete, onNew }: { summary: Summary; documents: StudyDocument[]; renameValue: string; copyMessage: string; onRenameValue: (value: string) => void; onRename: () => void; onCopy: () => void; onDelete: () => void; onNew: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const sourceNames = summary.sourceDocumentIds.map((id) => documents.find((document) => document.id === id)?.fileName).filter(Boolean)
  return <div className="summary-reader-layout"><article className="summary-reading-panel"><div className="summary-reading-meta"><span className="mock-badge">Mock / demo</span><span>{summary.length} · {summary.language} · {summary.structure}</span></div><h2>{summary.title}</h2><p className="summary-disclaimer">This is predefined practice content. It does not claim to have analysed your uploaded documents.</p>{summary.sections.map((section) => <section className="summary-reading-section" key={section.heading}><h3>{section.heading}</h3><ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul></section>)}</article><aside className="summary-reader-aside"><div className="detail-panel"><div className="section-heading"><h3>Manage summary</h3><Pencil size={16} /></div><label className="summary-select">Title<input value={renameValue} onChange={(event) => onRenameValue(event.target.value)} onBlur={onRename} /></label><div className="summary-reader-actions"><button className="button" onClick={onCopy}><Clipboard size={15} /> {copyMessage || 'Copy summary'}</button><button className="button button-ghost" onClick={onNew}>New summary</button>{confirmingDelete ? <div className="inline-confirm"><span>Delete this saved summary?</span><button className="danger-action" onClick={onDelete}>Yes, delete</button><button className="button button-ghost" onClick={() => setConfirmingDelete(false)}>Cancel</button></div> : <button className="danger-action" onClick={() => setConfirmingDelete(true)}><Trash2 size={15} /> Delete summary</button>}</div></div><div className="detail-panel summary-sources-card"><span className="eyebrow">Sources used</span>{sourceNames.map((name) => <span key={name}><FileText size={14} />{name}</span>)}<small>{summary.sourceLabel}</small></div></aside></div>
}
