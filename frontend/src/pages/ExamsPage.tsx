import { Award, ArrowRight, CheckCircle2, ChevronRight, Clock3, FileQuestion, Plus, Timer, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { Button } from '../components/ui/Button'
import { examService } from '../services/api-client'
import type { ExamAttempt, ExamCourseOption } from '../services/contracts/exams'

const questionCounts = [5, 8, 12, 20]
const timeLimits = [15, 30, 45, 60]

export function ExamsPage() {
  const [attempts, setAttempts] = useState<ExamAttempt[]>([])
  const [options, setOptions] = useState<ExamCourseOption[]>([])
  const [loading, setLoading] = useState(true)
  const [setupOpen, setSetupOpen] = useState(false)
  const [error, setError] = useState('')

  function loadExamLibrary(showLoading = true) {
    if (showLoading) { setLoading(true); setError('') }
    void Promise.all([examService.listAttempts(), examService.getOptions()]).then(([history, choices]) => {
      setAttempts(history)
      setOptions(choices)
      setLoading(false)
    }).catch(() => { setError('We could not load your exam history. Try again; your previous attempts are unchanged.'); setLoading(false) })
  }
  useEffect(() => { let active = true; void Promise.all([examService.listAttempts(), examService.getOptions()]).then(([history, choices]) => { if (active) { setAttempts(history); setOptions(choices); setLoading(false) } }).catch(() => { if (active) { setError('We could not load your exam history. Try again; your previous attempts are unchanged.'); setLoading(false) } }); return () => { active = false } }, [])

  return <div className="page-stack exams-page">
    <div className="page-intro"><div><span className="eyebrow">Test your knowledge</span><h2>Practice exams</h2><p>Use a focused exam to check your understanding, then turn the result into your next study step.</p></div><Button onClick={() => setSetupOpen(true)}><Plus size={16} /> Create practice exam</Button></div>
    <section className="exam-hero"><div className="exam-hero-icon"><FileQuestion size={25} /></div><div><span className="eyebrow">A useful check-in</span><h3>Build an exam around what you are learning now.</h3><p>Choose a course, focus concepts, and a pace that leaves room for your own reasoning.</p></div><button className="round-arrow" onClick={() => setSetupOpen(true)} aria-label="Create practice exam"><ArrowRight size={18} /></button></section>
    <section className="exam-history-section"><div className="section-heading"><div><span className="eyebrow">Your record</span><h2>Past attempts</h2></div><span className="muted">{attempts.length} completed</span></div>{loading ? <ExamHistorySkeleton /> : error ? <EmptyState title="Exam history is unavailable" text={error} action={<button className="button button-secondary"     onClick={() => loadExamLibrary()}>Try again</button>} /> : attempts.length ? <div className="exam-history-list">{attempts.map((attempt) => <ExamAttemptRow attempt={attempt} key={attempt.id} />)}</div> : <EmptyState title="No completed exams yet" text="Create a practice exam when you are ready to see your results and revision suggestions here." />}</section>
    {setupOpen && <ExamSetupDialog options={options} onClose={() => setSetupOpen(false)} />}
  </div>
}

function ExamAttemptRow({ attempt }: { attempt: ExamAttempt }) {
  return <Link to={`/exams/${attempt.id}/results`} className="exam-history-row"><div className="exam-history-icon"><Award size={18} /></div><div className="exam-history-copy"><strong>{attempt.title}</strong><span>{attempt.course} · {attempt.date}</span></div><div className="exam-history-meta"><span><Clock3 size={13} /> {attempt.duration}</span><strong>{attempt.score === undefined ? 'Mock' : `${attempt.score}%`}</strong><small>{attempt.result}</small></div><ChevronRight size={17} className="exam-history-arrow" /></Link>
}

function ExamSetupDialog({ options, onClose }: { options: ExamCourseOption[]; onClose: () => void }) {
  const navigate = useNavigate()
  const [step, setStep] = useState<'setup' | 'summary'>('setup')
  const [courseId, setCourseId] = useState(options[0]?.id ?? '')
  const [topicIds, setTopicIds] = useState<string[]>([])
  const [questionCount, setQuestionCount] = useState(8)
  const [timeLimit, setTimeLimit] = useState(30)
  const [starting, setStarting] = useState(false)
  const course = options.find((item) => item.id === courseId) ?? options[0]
  const allTopicsSelected = Boolean(course && topicIds.length === course.concepts.length)
  const selectedTopics = course?.concepts.filter((topic) => topicIds.includes(topic.id)) ?? []
  function changeCourse(id: string) { setCourseId(id); setTopicIds([]) }
  function toggleTopic(id: string) { setTopicIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  function continueToSummary() { if (course && topicIds.length) setStep('summary') }
  async function startExam() {
    if (!course) return
    setStarting(true)
    const exam = await examService.createExam({ courseId, topicIds, questionCount, timeLimit })
    navigate(`/exams/${exam.id}`)
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !starting) onClose() }}><section className="dialog exam-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-setup-title"><div className="dialog-heading"><div><span className="eyebrow">{step === 'setup' ? 'Exam setup' : 'Ready when you are'}</span><h2 id="exam-setup-title">{step === 'setup' ? 'Create a practice exam' : 'Review your exam'}</h2></div><button className="icon-button" onClick={onClose} disabled={starting} aria-label="Close dialog"><X size={18} /></button></div>{step === 'setup' ? <div className="exam-form"><label>Course<select value={courseId} onChange={(event) => changeCourse(event.target.value)}>{options.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}</select></label><fieldset><legend>Concepts</legend><div className="topic-select-heading"><span>Select at least one focus area</span><button type="button" onClick={() => setTopicIds(allTopicsSelected ? [] : course?.concepts.map((topic) => topic.id) ?? [])}>{allTopicsSelected ? 'Clear all' : 'Select all'}</button></div><div className="exam-topic-options">{course?.concepts.map((topic) => <label className={`exam-topic-option ${topicIds.includes(topic.id) ? 'selected' : ''}`} key={topic.id}><input type="checkbox" checked={topicIds.includes(topic.id)} onChange={() => toggleTopic(topic.id)} /><span>{topic.title}</span><CheckCircle2 size={15} /></label>)}</div></fieldset><div className="exam-form-grid"><label>Questions<select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>{questionCounts.map((count) => <option key={count} value={count}>{count} questions</option>)}</select></label><label>Time limit<select value={timeLimit} onChange={(event) => setTimeLimit(Number(event.target.value))}>{timeLimits.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label></div><div className="dialog-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="button" onClick={continueToSummary} disabled={!topicIds.length}>Review exam</Button></div></div> : <ExamSummary course={course} selectedTopics={selectedTopics} questionCount={questionCount} timeLimit={timeLimit} starting={starting} onBack={() => setStep('setup')} onStart={() => void startExam()} />}</section></div>
}

function ExamSummary({ course, selectedTopics, questionCount, timeLimit, starting, onBack, onStart }: { course?: ExamCourseOption; selectedTopics: ExamCourseOption['concepts']; questionCount: number; timeLimit: number; starting: boolean; onBack: () => void; onStart: () => void }) {
  return <div className="exam-summary"><div className="exam-summary-lead"><div className="exam-summary-icon"><Timer size={19} /></div><div><strong>{questionCount} questions in {timeLimit} minutes</strong><span>Course-grounded practice for {course?.title}</span></div></div><div className="exam-summary-list"><div><span>Focus concepts</span><strong>{selectedTopics.map((topic) => topic.title).join(', ')}</strong></div><div><span>What to expect</span><strong>One question at a time, with a useful result summary at the end.</strong></div></div><p className="exam-summary-note">This is a deterministic mock exam. No AI-generated questions or backend requests are used.</p><div className="dialog-actions"><Button type="button" variant="ghost" onClick={onBack} disabled={starting}>Edit setup</Button><Button type="button" onClick={onStart} disabled={starting}>{starting ? 'Preparing exam…' : 'Start practice exam'} <ArrowRight size={15} /></Button></div></div>
}

function ExamHistorySkeleton() { return <div className="exam-history-skeleton" role="status" aria-label="Loading exam history"><span /><span /><span /></div> }
