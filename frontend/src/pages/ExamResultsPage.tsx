import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Clock3, Compass, Target, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { LoadingState } from '../components/feedback/LoadingState'
import { ProgressBar } from '../components/ui/ProgressBar'
import { examService } from '../services/api-client'
import type { ExamQuestionResult, ExamResult, ExamVerdict } from '../services/contracts/exams'

const verdicts: ExamVerdict[] = ['Correct', 'Partially correct', 'Incorrect', 'Insufficient evidence']

export function ExamResultsPage() {
  const { examId } = useParams()
  const [result, setResult] = useState<ExamResult>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { if (examId) void examService.getResult(examId).then((value) => { setResult(value); setLoading(false) }).catch(() => { setError('This practice feedback could not load. Return to the exams library and try another attempt.'); setLoading(false) }) }, [examId])
  if (loading) return <LoadingState label="Preparing your practice feedback" />
  if (!result) return <EmptyState title={error ? 'Practice feedback unavailable' : 'Practice result not found'} text={error || 'This result may have expired. Return to the exams library and try another practice exam.'} action={<Link className="button button-secondary" to="/exams">Back to exams</Link>} />
  return <div className="page-stack exam-results-page"><Link to="/exams" className="back-link"><ArrowLeft size={15} /> Exams library</Link><section className="exam-results-hero"><div><span className="eyebrow">Practice feedback · {result.course}</span><h2>{result.title}</h2><p>Use this as evidence for what to revise next, not as a prediction of a real exam score.</p></div><div className="practice-signal"><strong>{result.scoreLabel}</strong><span>Feedback snapshot</span></div></section><div className="exam-results-actions"><Link to={`/courses/${result.courseId}`} className="text-link">Back to course <ArrowRight size={14} /></Link><Link to="/progress" className="text-link">View study progress <Compass size={14} /></Link></div><div className="exam-results-summary-grid"><SummaryStat icon={<CheckCircle2 size={17} />} label="Completed" value={`${result.completedQuestions}/${result.totalQuestions}`} detail="questions reviewed" /><SummaryStat icon={<Clock3 size={17} />} label="Time used" value={result.timeUsed} detail="frontend mock timer" /><SummaryStat icon={<Target size={17} />} label="Strongest signal" value={`${result.counts.Correct}`} detail="correct responses" /></div><section className="verdict-counts">{verdicts.map((verdict) => <div className={`verdict-count ${verdictClass(verdict)}`} key={verdict}><VerdictIcon verdict={verdict} /><strong>{result.counts[verdict]}</strong><span>{verdict}</span></div>)}</section><div className="exam-results-grid"><section className="progress-panel question-results-panel"><div className="section-heading"><div><span className="eyebrow">Review your reasoning</span><h2>Question feedback</h2></div></div><div className="question-result-list">{result.questionResults.map((item, index) => <QuestionResult item={item} index={index} key={item.question.id} />)}</div></section><aside className="progress-panel concept-performance-panel"><div className="section-heading"><div><span className="eyebrow">Patterns across the exam</span><h2>Concept performance</h2></div></div><div className="concept-result-list">{result.concepts.map((concept) => <div className="concept-result" key={concept.concept}><div className="concept-result-heading"><strong>{concept.concept}</strong><span>{concept.correct}/{concept.total} correct</span></div><ProgressBar value={concept.total ? (concept.correct / concept.total) * 100 : 0} color={concept.correct === concept.total ? 'green' : 'orange'} /><p>{concept.summary}</p><small><strong>Next:</strong> {concept.nextAction}</small><Link className="text-link" to={`/study/session-general-01`}>Study this concept <ArrowRight size={13} /></Link></div>)}</div></aside></div><p className="exam-results-disclaimer"><AlertCircle size={15} /> Practice feedback is based on predefined mock evaluation evidence. It is not an official grade, certification result, or prediction of future exam performance.</p></div>
}

function SummaryStat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return <div className="stat-card"><div className="stat-icon green">{icon}</div><div><span className="muted">{label}</span><strong className="stat-value">{value}</strong><span className="stat-detail">{detail}</span></div></div>
}

function QuestionResult({ item, index }: { item: ExamQuestionResult; index: number }) {
  const [open, setOpen] = useState(index === 0)
  return <article className={`question-result ${open ? 'open' : ''}`}><button className="question-result-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span className="question-result-number">{index + 1}</span><span className="question-result-title"><strong>{item.question.prompt}</strong><small>{item.question.concept}</small></span><span className={`status-label ${verdictClass(item.verdict)}`}>{item.verdict}</span>{open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>{open && <div className="question-result-body"><div className="answer-review"><span className="eyebrow">Student answer</span><p>{item.answer}</p></div><div className="feedback-columns"><FeedbackList title="Expected ideas" items={item.expectedIdeas} /><FeedbackList title="Strengths" items={item.strengths} empty="No clear strength recorded in this mock response." /><FeedbackList title="Gaps to revisit" items={item.gaps} empty="No major gap recorded." /></div><div className="question-confidence"><span>Mock confidence</span><strong>{item.confidence}</strong></div></div>}</article>
}

function FeedbackList({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  return <div><strong>{title}</strong>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="feedback-empty">{empty}</p>}</div>
}

function VerdictIcon({ verdict }: { verdict: ExamVerdict }) {
  if (verdict === 'Correct') return <CheckCircle2 size={16} />
  if (verdict === 'Incorrect') return <XCircle size={16} />
  return <AlertCircle size={16} />
}

function verdictClass(verdict: ExamVerdict) {
  return verdict.toLowerCase().replaceAll(' ', '-')
}
