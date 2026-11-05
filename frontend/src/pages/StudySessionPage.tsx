import { AlertCircle, ArrowLeft, BookOpen, Check, ChevronRight, CircleHelp, FileText, Lightbulb, LockKeyhole, MessageSquareText, RotateCcw, Send, Sparkles, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { Button } from '../components/ui/Button'
import { ProgressBar } from '../components/ui/ProgressBar'
import { useStudySessionController } from '../features/study-session/useStudySessionController'
import { studySessionService } from '../services/api-client'
import type { StudySessionDetail } from '../services/contracts/sessions'

export function StudySessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<StudySessionDetail>()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    if (!sessionId) return
    void studySessionService.getSession(sessionId).then((detail) => {
      if (active) {
        setSession(detail)
        setLoading(false)
      }
    }).catch(() => {
      if (active) {
        setLoadError(true)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [sessionId])

  if (loading) return <SessionSkeleton />
  if (loadError) return <EmptyState title="This session could not load" text="Your local session state is safe. Return to your course and try again." />
  if (!session) return <EmptyState title="Session not found" text="This study session is no longer available." />

  return <StudySessionWorkspace key={session.id} session={session} onExit={() => navigate(session.courseId ? `/courses/${session.courseId}` : '/courses')} />
}

function StudySessionWorkspace({ session, onExit }: { session: StudySessionDetail; onExit: () => void }) {
  const controller = useStudySessionController(session)
  const { state, question, progress, isLastQuestion, evaluating, update, submitAnswer, retry, continueToNext, requestHint, summary } = controller
  const [abandonOpen, setAbandonOpen] = useState(false)
  if (!question) return <EmptyState title="No activities yet" text="This session does not have any questions to work through." />
  const hasActiveWork = Boolean(state.answer.trim() || state.history.length || state.hintLevel || state.explanationVisible || state.feedback)
  function requestExit() {
    if (hasActiveWork && !state.summaryVisible) setAbandonOpen(true)
    else onExit()
  }

  return <div className="study-workspace" aria-label="Focused study session">
    <header className="study-header">
      <button className="study-exit" onClick={requestExit}><ArrowLeft size={16} /> Leave session</button>
      <div className="study-header-course"><BookOpen size={16} /><span>{session.course}</span><ChevronRight size={14} /><strong>{question.topic}</strong></div>
      <span className={`study-mode ${session.mode === 'Course-grounded' ? 'grounded' : 'general'}`}><LockKeyhole size={13} /> {session.mode}</span>
    </header>

    <div className="study-progress-row"><div><span className="eyebrow">Activity {state.questionIndex + 1} of {session.questions.length}</span><ProgressBar value={progress} /></div><span>{Math.round(progress)}%</span></div>

    {state.summaryVisible ? <SessionSummary session={session} summary={summary} onExit={onExit} /> : <div className="study-layout">
      <main className="study-main">
        <section className="study-goal"><div className="goal-icon"><Target size={19} /></div><div><span className="eyebrow">Session goal</span><strong>{session.goal}</strong></div></section>
        <section className="question-card" aria-labelledby="study-question">
        <div className="question-label"><Sparkles size={16} /> Think it through <span className="question-status" aria-live="polite">{state.feedback ? 'Feedback ready' : state.submissionError ? 'Submission error' : 'Awaiting your reasoning'}</span></div>
        <h1 id="study-question">{question.prompt}</h1>
          {question.context && <p className="question-context">{question.context}</p>}
          <label className="answer-editor"><span>Your answer</span><textarea value={state.answer} disabled={Boolean(state.feedback)} onChange={(event) => update({ answer: event.target.value })} placeholder="Write what you think, in your own words…" rows={7} /></label>
          <div className="answer-footer"><span>{state.feedback ? 'Answer submitted' : `${state.answer.length} characters`}</span>{state.feedback ? <Button variant="secondary" onClick={retry}><RotateCcw size={15} /> Retry this question</Button> : <Button onClick={() => void submitAnswer()} disabled={!state.answer.trim() || evaluating}>{evaluating ? 'Checking mock scenario…' : <><Send size={15} /> Submit answer</>}</Button>}</div>
          {state.submissionError && <p className="submission-error" role="alert"><AlertCircle size={15} /> {state.submissionError}</p>}
          {state.feedback && <FeedbackPanel feedback={state.feedback} />}
        </section>
        {!state.feedback && <div className="study-actions"><button className="hint-action" onClick={requestHint} disabled={state.hintLevel >= question.hints.length}><Lightbulb size={17} /><span>{state.hintLevel === 0 ? 'Need a hint?' : state.hintLevel < question.hints.length ? `Show next hint (${state.hintLevel}/${question.hints.length})` : 'All hints shown'}</span></button><button className="explanation-action" onClick={() => update({ explanationVisible: !state.explanationVisible })}><CircleHelp size={17} /> {state.explanationVisible ? 'Hide explanation' : 'Request an explanation'}</button></div>}
        {!state.feedback && state.hintLevel > 0 && <div className="hint-panel"><Lightbulb size={17} /><div><span className="eyebrow">Hint {state.hintLevel}</span><p>{question.hints[state.hintLevel - 1]}</p></div></div>}
        {!state.feedback && state.explanationVisible && <div className="explanation-panel"><div className="explanation-icon"><MessageSquareText size={18} /></div><div><span className="eyebrow">A useful explanation</span><p>{question.explanation}</p></div></div>}
        {state.feedback && <button className="continue-question" onClick={continueToNext}>{isLastQuestion ? 'View session summary' : 'Continue to follow-up question'} <ChevronRight size={17} /></button>}
        {state.history.length > 0 && <AnswerHistory history={state.history} />}
      </main>
      <StudySources mode={session.mode} sources={question.sources} />
    </div>}
    {abandonOpen && <AbandonDialog onCancel={() => setAbandonOpen(false)} onConfirm={onExit} />}
  </div>
}

function FeedbackPanel({ feedback }: { feedback: NonNullable<ReturnType<typeof useStudySessionController>['state']['feedback']> }) {
  const tone = feedback.verdict === 'Correct' ? 'correct' : feedback.verdict === 'Partially correct' ? 'partial' : feedback.verdict === 'Incorrect' ? 'incorrect' : 'evidence'
  return <div className={`structured-feedback ${tone}`} role="status" aria-live="polite"><div className="feedback-heading"><span className="verdict-icon">{feedback.verdict === 'Correct' ? <Check size={17} /> : <AlertCircle size={17} />}</span><div><span className="eyebrow">Feedback ready</span><strong>{feedback.verdict}</strong></div><span className="confidence">Confidence: {feedback.confidence}</span></div><div className="feedback-grid"><div><strong>What worked</strong><ul>{feedback.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div><div><strong>Still to show</strong><ul>{feedback.missingIdeas.map((item) => <li key={item}>{item}</li>)}</ul></div></div>{feedback.misconception && <p className="misconception"><AlertCircle size={15} /> <span><strong>Watch for this:</strong> {feedback.misconception}</span></p>}<div className="next-activity"><span className="eyebrow">Recommended next activity</span><strong>{feedback.nextActivity}</strong></div></div>
}

function AnswerHistory({ history }: { history: ReturnType<typeof useStudySessionController>['state']['history'] }) {
  return <section className="answer-history"><div className="section-heading"><div><span className="eyebrow">Your reasoning trail</span><h2>Answer history</h2></div></div>{history.map((record, index) => <div className="history-row" key={`${record.questionId}-${index}`}><span>{index + 1}</span><div><strong>{record.questionTopic}</strong><p>{record.answer}</p></div><em>{record.feedback.verdict}</em></div>)}</section>
}

function SessionSummary({ session, summary, onExit }: { session: StudySessionDetail; summary: { strengths: string[]; gaps: string[]; revision: string }; onExit: () => void }) {
  return <section className="session-summary" role="status" aria-live="polite"><div className="summary-icon"><Sparkles size={22} /></div><span className="eyebrow">Session complete</span><h1>Good work, {session.course === 'Independent study' ? 'learner' : 'Maya'}.</h1><p>You made your reasoning visible across {session.questions.length} activities. Here’s what to carry forward.</p><div className="summary-grid"><div><strong>Demonstrated strengths</strong>{summary.strengths.length ? <ul>{summary.strengths.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Keep explaining your thinking out loud.</p>}</div><div><strong>Unresolved gaps</strong>{summary.gaps.length ? <ul>{summary.gaps.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No unresolved gaps in this session.</p>}</div></div><div className="summary-revision"><span className="eyebrow">Suggested revision</span><strong>{summary.revision}</strong></div><Button onClick={onExit}>Return to course</Button></section>
}

function AbandonDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return <div className="dialog-backdrop" role="presentation"><section className="dialog abandon-dialog" role="alertdialog" aria-modal="true" aria-labelledby="abandon-title" aria-describedby="abandon-description"><div className="abandon-icon"><AlertCircle size={20} /></div><h2 id="abandon-title">Leave this session?</h2><p id="abandon-description">Your answer and progress are saved locally, but the current activity will not be completed.</p><div className="dialog-actions"><Button type="button" variant="ghost" onClick={onCancel}>Keep studying</Button><Button type="button" onClick={onConfirm}>Leave session</Button></div></section></div>
}

function StudySources({ mode, sources }: { mode: StudySessionDetail['mode']; sources: StudySessionDetail['sources'] }) {
  return <aside className="study-aside"><section className="study-aside-panel"><div className="aside-heading"><FileText size={17} /><h2>Study sources</h2></div>{mode === 'Course-grounded' && sources.length > 0 ? <div className="source-list">{sources.map((source) => <div className="source-item" key={`${source.title}-${source.page}`}><div className="source-page">p.{source.page}</div><div><strong>{source.title}</strong><p>“{source.excerpt}”</p></div></div>)}</div> : <div className="general-source"><Sparkles size={17} /><p>This is a general-knowledge prompt. Use your own understanding and explain your assumptions.</p></div>}</section><section className="study-aside-panel session-note-panel"><span className="eyebrow">Keep your own reasoning</span><p>There’s no rush to be perfect. An imperfect explanation gives you something useful to improve.</p><Link to="/progress" className="text-link">View your progress <ChevronRight size={14} /></Link></section></aside>
}

function SessionSkeleton() {
  return <div className="study-skeleton" role="status" aria-label="Loading study session"><span /><div><span /><span /><span /></div><aside><span /><span /></aside></div>
}
