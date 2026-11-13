import { AlertCircle, ArrowLeft, Check, ChevronLeft, ChevronRight, Clock3, Flag, ListChecks, Send, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { LoadingState } from '../components/feedback/LoadingState'
import { Button } from '../components/ui/Button'
import { useExamController } from '../features/exams/useExamController'
import { examService } from '../services/api-client'
import type { ExamQuestion, PracticeExam } from '../services/contracts/exams'
import { classifyAiError } from '../services/ai-error'
import { getDataMode } from '../services/service-mode'

export function ActiveExamPage() {
  const { examId } = useParams()
  const [exam, setExam] = useState<PracticeExam>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!examId) return
    void examService.getExam(examId).then((result) => { setExam(result); setLoading(false) }).catch(() => { setError('This practice exam could not be loaded. Return to the exams library and start another one.'); setLoading(false) })
  }, [examId])
  if (loading) return <LoadingState label="Preparing your practice exam" />
  if (!exam) return <EmptyState title={error ? 'Practice exam unavailable' : 'This practice exam is not available'} text={error || 'It may already have been submitted (for example when the time ran out). Its feedback is under results.'} action={<span className="empty-state-actions"><Link className="button button-secondary" to={`/exams/${examId}/results`}>See results</Link> <Link className="button button-ghost" to="/exams">Back to exams</Link></span>} />
  return <ActiveExamWorkspace exam={exam} />
}

function ActiveExamWorkspace({ exam }: { exam: PracticeExam }) {
  const navigate = useNavigate()
  const controller = useExamController(exam)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const attemptId = exam.attemptId ?? exam.id
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSubmitStarted = useRef(false)

  const { currentQuestion, currentIndex, answers, flagged, formatTime, remainingSeconds, answeredCount, answerQuestion, toggleFlag, goTo, isFirst, isLast } = controller

  // Persist answer to server when answer changes (debounced, fire-and-forget)
  const saveToServer = useCallback((questionId: string, answer: string, isFlagged: boolean) => {
    if (!examService.saveAnswer) return
    if (pendingSave.current) window.clearTimeout(pendingSave.current)
    pendingSave.current = window.setTimeout(() => {
      void examService.saveAnswer!(attemptId, questionId, answer, isFlagged)
    }, 800)
  }, [attemptId])

  const handleAnswerQuestion = useCallback((answer: string) => {
    answerQuestion(answer)
    if (currentQuestion) saveToServer(currentQuestion.id, answer, flagged.includes(currentQuestion.id))
  }, [answerQuestion, currentQuestion, flagged, saveToServer])

  const handleGoTo = useCallback((index: number) => {
    // Flush any pending save immediately on navigation
    if (pendingSave.current) {
      window.clearTimeout(pendingSave.current)
      pendingSave.current = null
    }
    if (currentQuestion && examService.saveAnswer) {
      const answer = answers[currentQuestion.id] ?? ''
      void examService.saveAnswer(attemptId, currentQuestion.id, answer, flagged.includes(currentQuestion.id))
    }
    goTo(index)
  }, [answers, attemptId, currentQuestion, flagged, goTo])

  async function submitExam() {
    setSubmitting(true)
    setSubmitError('')
    setConfirmOpen(false)
    try {
      // Flush any in-flight answer saves first
      if (pendingSave.current) {
        window.clearTimeout(pendingSave.current)
        pendingSave.current = null
      }
      if (examService.saveAnswer) {
        await Promise.allSettled(
          exam.questions
            .filter((q) => answers[q.id]?.trim())
            .map((q) => examService.saveAnswer!(attemptId, q.id, answers[q.id], flagged.includes(q.id))),
        )
      }
      if (examService.submitAttempt) {
        await examService.submitAttempt(attemptId)
      }
      setSubmitted(true)
    } catch (error) {
      const { userMessage, retryable } = classifyAiError(error)
      setSubmitError(retryable ? (userMessage || 'Submission failed. Check your connection and try again.') : (userMessage || 'Submission failed.'))
      setSubmitting(false)
    }
  }

  // The server auto-submits at the deadline too; this makes the page follow immediately.
  useEffect(() => {
    if (remainingSeconds <= 0 && !submitted && !submitting && !autoSubmitStarted.current) {
      autoSubmitStarted.current = true
      void submitExam()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, submitted, submitting])

  if (!currentQuestion) return <EmptyState title="This exam has no questions" text="Return to the exams library and create another practice exam." />
  if (submitted) return <ExamSubmitted exam={exam} answeredCount={answeredCount} onResults={() => navigate(`/exams/${exam.id}/results`)} />
  return <div className="active-exam-page">
    <header className="active-exam-header"><button className="study-exit" onClick={() => setConfirmOpen(true)} disabled={submitting}><ArrowLeft size={16} /> Leave exam</button><div className="active-exam-title"><span className="eyebrow">Practice exam</span><h2>{exam.title}</h2><small>{exam.course}</small></div><div className={`exam-timer ${remainingSeconds < 300 ? 'urgent' : ''}`} role="timer" aria-label={`${formatTime} remaining`}><Clock3 size={17} /><strong>{formatTime}</strong><span>remaining</span></div></header>
    <div className="active-exam-body"><aside className="exam-question-nav"><div className="exam-nav-heading"><div><span className="eyebrow">Questions</span><strong>{answeredCount} of {exam.questions.length} answered</strong></div><ListChecks size={18} /></div><div className="exam-question-grid">{exam.questions.map((question, index) => <button key={question.id} className={`${index === currentIndex ? 'current' : ''} ${answers[question.id] ? 'answered' : ''} ${flagged.includes(question.id) ? 'flagged' : ''}`} onClick={() => handleGoTo(index)} aria-label={`Question ${index + 1}${answers[question.id] ? ', answered' : ', unanswered'}${flagged.includes(question.id) ? ', flagged' : ''}`}>{index + 1}{flagged.includes(question.id) && <Flag size={10} />}</button>)}</div><div className="exam-nav-legend"><span><i className="answered-dot" /> Answered</span><span><i className="flagged-dot" /> Flagged</span></div></aside><section className="active-exam-main"><div className="exam-progress-line"><span>Question {currentIndex + 1} of {exam.questions.length}</span><div><span style={{ width: `${((currentIndex + 1) / exam.questions.length) * 100}%` }} /></div></div><section className="active-question-card"><div className="active-question-meta"><span className="course-tag">{currentQuestion.concept}</span><span>{currentQuestion.type === 'multiple-choice' ? 'Multiple choice' : 'Short answer'}</span></div><h3>{currentQuestion.prompt}</h3><QuestionInput question={currentQuestion} value={answers[currentQuestion.id] ?? ''} disabled={remainingSeconds === 0 || submitting} onChange={handleAnswerQuestion} /><div className="active-question-actions"><button className={`flag-button ${flagged.includes(currentQuestion.id) ? 'selected' : ''}`} onClick={toggleFlag} disabled={submitting}><Flag size={16} /> {flagged.includes(currentQuestion.id) ? 'Flagged for review' : 'Flag for review'}</button><span className="answer-state">{answers[currentQuestion.id] ? <><Check size={14} /> {examService.saveAnswer ? 'Answer saved' : 'Answer saved locally'}</> : 'Not answered yet'}</span></div></section>{submitError && <p className="exam-timeout" role="alert"><AlertCircle size={15} /> {submitError}</p>}<div className="active-exam-controls"><Button variant="secondary" onClick={() => handleGoTo(currentIndex - 1)} disabled={isFirst || submitting}><ChevronLeft size={16} /> Previous</Button>{isLast ? <Button onClick={() => setConfirmOpen(true)} disabled={submitting}>{submitting ? 'Submitting…' : <><Send size={15} /> Submit exam</>}</Button> : <Button onClick={() => handleGoTo(currentIndex + 1)} disabled={submitting}>Next <ChevronRight size={16} /></Button>}</div>{remainingSeconds === 0 && <p className="exam-timeout" role="alert"><AlertCircle size={15} /> Time has ended. Review your answers, then submit the exam.</p>}</section></div>
    {confirmOpen && <SubmitExamDialog exam={exam} answeredCount={answeredCount} flaggedCount={flagged.length} onCancel={() => setConfirmOpen(false)} onConfirm={() => void submitExam()} />}
  </div>
}

function QuestionInput({ question, value, disabled, onChange }: { question: ExamQuestion; value: string; disabled: boolean; onChange: (value: string) => void }) {
  if (question.type === 'short-answer') return <label className="active-answer-editor"><span>Your answer</span><textarea value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} rows={7} placeholder="Write a concise answer in your own words…" /></label>
  return <fieldset className="multiple-choice-options"><legend>Choose one answer</legend>{question.options?.map((option) => <label className={`multiple-choice-option ${value === option ? 'selected' : ''}`} key={option}><input type="radio" name={question.id} value={option} checked={value === option} onChange={(event) => onChange(event.target.value)} disabled={disabled} /><span>{option}</span>{value === option && <Check size={16} />}</label>)}</fieldset>
}

function SubmitExamDialog({ exam, answeredCount, flaggedCount, onCancel, onConfirm }: { exam: PracticeExam; answeredCount: number; flaggedCount: number; onCancel: () => void; onConfirm: () => void }) {
  return <div className="dialog-backdrop" role="presentation"><section className="dialog submit-exam-dialog" role="dialog" aria-modal="true" aria-labelledby="submit-exam-title"><div className="dialog-heading"><div><span className="eyebrow">One last check</span><h2 id="submit-exam-title">Submit exam?</h2></div><button className="icon-button" onClick={onCancel} aria-label="Close dialog"><X size={18} /></button></div><p className="submit-exam-copy">You are about to submit <strong>{exam.title}</strong>. You can review the summary after submission, but answers cannot be changed.</p><div className="submit-exam-stats"><span><strong>{answeredCount}</strong> answered</span><span><strong>{exam.questions.length - answeredCount}</strong> unanswered</span><span><strong>{flaggedCount}</strong> flagged</span></div><div className="dialog-actions"><Button type="button" variant="ghost" onClick={onCancel}>Keep working</Button><Button type="button" onClick={onConfirm}>Submit exam <Send size={15} /></Button></div></section></div>
}

function ExamSubmitted({ exam, answeredCount, onResults }: { exam: PracticeExam; answeredCount: number; onResults: () => void }) {
  return <div className="exam-submitted"><div className="exam-submitted-icon"><Check size={24} /></div><span className="eyebrow">Exam submitted</span><h1>Your answers are recorded.</h1><p>{answeredCount} of {exam.questions.length} questions had an answer.{getDataMode('exams') === 'mock' ? ' This mock exam has no live grading or correctness feedback.' : ' Your answers are now being graded; the results page shows the progress.'}</p><Button onClick={onResults}>View results summary <ChevronRight size={16} /></Button></div>
}
