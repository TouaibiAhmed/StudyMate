import { ArrowLeft, Check, Flag, Lightbulb, LoaderCircle, RotateCcw, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { courseService, studyToolsService } from '../services/api-client'
import type { CourseDetail } from '../services/contracts/courses'
import type { Quiz, QuizAttemptResult } from '../services/contracts/study-tools'
import { classifyAiError } from '../services/ai-error'

type PlayerAnswer = Record<string, string>

export function QuizPlayerPage() {
  const { courseId, quizId } = useParams()
  const [course, setCourse] = useState<CourseDetail>()
  const [quiz, setQuiz] = useState<Quiz>()
  const [answers, setAnswers] = useState<PlayerAnswer>({})
  const [flagged, setFlagged] = useState<string[]>([])
  const [current, setCurrent] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [serverResult, setServerResult] = useState<QuizAttemptResult>()

  useEffect(() => {
    if (!courseId || !quizId) return
    void Promise.all([courseService.getCourse(courseId), studyToolsService.listQuizzes(courseId)]).then(([courseData, quizzes]) => {
      setCourse(courseData)
      setQuiz(quizzes.find((item) => item.id === quizId))
    })
  }, [courseId, quizId])

  if (!courseId || !quizId) return <EmptyState title="Quiz unavailable" text="This quiz link is incomplete." action={<Link className="button" to="/courses">Back to courses</Link>} />
  if (!course || !quiz) return <div className="summary-page-loading"><LoaderCircle className="spin" size={22} /> Loading quiz…</div>
  const question = quiz.questions[current]
  const answeredCount = Object.keys(answers).length
  // Local grading only used in mock mode; in api mode, serverResult carries the grades
  const localCorrectCount = quiz.questions.filter((item) => answers[item.id]?.trim().toLowerCase() === item.answer.value.trim().toLowerCase()).length
  const unansweredCount = quiz.questions.length - answeredCount

  function setAnswer(value: string) { setAnswers((existing) => ({ ...existing, [question.id]: value })) }
  function toggleFlag() { setFlagged((existing) => existing.includes(question.id) ? existing.filter((id) => id !== question.id) : [...existing, question.id]) }

  async function submit() {
    if (!quiz) return
    setConfirming(false)
    setSubmitError('')
    if (studyToolsService.startQuizAttempt && studyToolsService.submitQuizAttempt) {
      setSubmitting(true)
      try {
        const { attemptId } = await studyToolsService.startQuizAttempt(quiz.id)
        const result = await studyToolsService.submitQuizAttempt(attemptId, answers)
        setServerResult(result)
        setSubmitted(true)
      } catch (error) {
        const info = classifyAiError(error)
        setSubmitError(info.userMessage || 'Quiz submission failed. Try again.')
      } finally {
        setSubmitting(false)
      }
    } else {
      setSubmitted(true)
    }
  }

  const isMockQuiz = quiz.isMock === true

  return <div className="page-stack quiz-player-page">
    <Link to={`/courses/${courseId}/quizzes/${quizId}`} className="back-link"><ArrowLeft size={15} /> Back to quiz overview</Link>
    <div className="quiz-player-header"><div><span className="eyebrow">{isMockQuiz ? 'Practice quiz · Mock demo' : 'Practice quiz'}</span><h1>{submitted ? 'Quiz feedback' : quiz.title}</h1><p>{submitted ? 'Review your result and use the suggestions to plan your next study block.' : 'Correct answers stay hidden until you submit. Written answers are graded by the AI model, which can take a minute.'}</p></div>{isMockQuiz && <span className="mock-badge">Mock content</span>}</div>
    {submitError && <p className="form-error" role="alert">{submitError} <button className="button button-ghost" onClick={() => void submit()} disabled={submitting}>Try again</button></p>}
    {submitted ? <QuizFeedback quiz={quiz} answers={answers} correctCount={serverResult?.correctCount ?? localCorrectCount} unansweredCount={serverResult?.unansweredCount ?? unansweredCount} serverResult={serverResult} course={course} onRetry={() => { setAnswers({}); setFlagged([]); setCurrent(0); setSubmitted(false); setServerResult(undefined) }} /> : <div className="quiz-player-layout"><aside className="detail-panel quiz-question-nav"><div className="section-heading"><h2>Questions</h2><span>{answeredCount}/{quiz.questions.length}</span></div><div className="question-nav-grid">{quiz.questions.map((item, index) => <button className={`${index === current ? 'current ' : ''}${answers[item.id] ? 'answered ' : ''}${flagged.includes(item.id) ? 'flagged' : ''}`} key={item.id} onClick={() => setCurrent(index)} aria-label={`Question ${index + 1}${answers[item.id] ? ', answered' : ', unanswered'}${flagged.includes(item.id) ? ', flagged' : ''}`}>{index + 1}</button>)}</div><div className="quiz-legend"><span><i className="answered-dot" /> Answered</span><span><i className="flag-dot" /> Flagged</span></div><button className="button quiz-submit-side" onClick={() => setConfirming(true)} disabled={submitting}><Send size={15} /> Submit quiz</button></aside><main className="detail-panel quiz-player-card"><div className="quiz-player-progress"><span>Question {current + 1} of {quiz.questions.length}</span><span>{Math.round(((current + 1) / quiz.questions.length) * 100)}%</span></div><div className="progress-track"><span style={{ width: `${((current + 1) / quiz.questions.length) * 100}%` }} /></div><div className="quiz-current-meta">{isMockQuiz && <span className="mock-badge">Demo question</span>}<button className={flagged.includes(question.id) ? 'flag-button flagged' : 'flag-button'} onClick={toggleFlag}><Flag size={16} /> {flagged.includes(question.id) ? 'Flagged for review' : 'Flag for review'}</button></div><span className="eyebrow">{question.type}</span><h2>{question.prompt}</h2>{question.type === 'Short Answer' ? <textarea value={answers[question.id] || ''} onChange={(event) => setAnswer(event.target.value)} placeholder="Write your answer…" aria-label="Your short answer" rows={5} /> : <div className="player-options" role="radiogroup" aria-label="Answer choices">{question.options?.map((option) => <label className={answers[question.id] === option ? 'selected' : ''} key={option}><input type="radio" name={question.id} value={option} checked={answers[question.id] === option} onChange={() => setAnswer(option)} />{option}</label>)}</div>}<div className="quiz-player-actions"><button className="button button-ghost" disabled={current === 0} onClick={() => setCurrent((value) => value - 1)}>Previous</button>{current < quiz.questions.length - 1 ? <button className="button" onClick={() => setCurrent((value) => value + 1)}>Next</button> : <button className="button" onClick={() => setConfirming(true)} disabled={submitting}>Review and submit</button>}</div></main></div>}
    {confirming && <SubmitDialog answeredCount={answeredCount} total={quiz.questions.length} onCancel={() => setConfirming(false)} onSubmit={() => void submit()} />}
    {submitting && <div className="dialog-backdrop" role="presentation"><section className="dialog" role="status"><LoaderCircle className="spin" size={22} /><p>Submitting your quiz…</p></section></div>}
  </div>
}

function SubmitDialog({ answeredCount, total, onCancel, onSubmit }: { answeredCount: number; total: number; onCancel: () => void; onSubmit: () => void }) {
  return <div className="dialog-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="submit-quiz-title"><span className="eyebrow">Final check</span><h2 id="submit-quiz-title">Submit this quiz?</h2><p>You have answered {answeredCount} of {total} questions. Unanswered questions will be marked incorrect.</p><div className="dialog-actions"><button className="button button-ghost" onClick={onCancel}>Keep working</button><button className="button" onClick={onSubmit}>Submit quiz</button></div></section></div>
}

function QuizFeedback({ quiz, answers, correctCount, unansweredCount, serverResult, course, onRetry }: { quiz: Quiz; answers: PlayerAnswer; correctCount: number; unansweredCount: number; serverResult?: QuizAttemptResult; course: CourseDetail; onRetry: () => void }) {
  const incorrectCount = quiz.questions.length - correctCount - unansweredCount
  return <div className="quiz-feedback"><section className="quiz-result-summary"><div><span className="eyebrow">Practice result</span><strong>{Math.round((correctCount / quiz.questions.length) * 100)}%</strong><span>{correctCount} of {quiz.questions.length} correct</span></div><div className="result-stat correct"><Check size={16} /> {correctCount} Correct</div><div className="result-stat incorrect">× {incorrectCount} Incorrect</div><div className="result-stat unanswered">— {unansweredCount} Unanswered</div></section><section className="detail-panel"><div className="section-heading"><div><span className="eyebrow">Answer review</span><h2>What to revise</h2></div><Lightbulb size={19} /></div><div className="feedback-question-list">{quiz.questions.map((item, index) => {
    const given = answers[item.id] || ''
    // In api mode, grades come from the server; in mock mode, compare locally
    const serverAnswer = serverResult?.answers.find((a) => a.questionId === item.id)
    const correct = serverAnswer ? serverAnswer.isCorrect : given.trim().toLowerCase() === item.answer.value.trim().toLowerCase()
    const correctAnswer = serverAnswer?.correctAnswer || item.answer.value
    const explanation = [serverAnswer?.feedback, serverAnswer?.explanation].filter(Boolean).join(' ')
    return <article className={`feedback-question ${correct ? 'correct' : 'incorrect'}`} key={item.id}><div><span className="eyebrow">Question {index + 1} · {correct ? 'Correct' : given ? 'Incorrect' : 'Unanswered'}</span><h3>{item.prompt}</h3></div><p><strong>Your answer:</strong> {given || 'No answer submitted'}</p><p><strong>Correct answer:</strong> {correctAnswer}</p>{explanation && <p><small><strong>Explanation:</strong> {explanation}</small></p>}{!correct && <small>Revision focus: {course.concepts.find((concept) => concept.id === item.topicId)?.title || 'Review the course fundamentals'}.</small>}</article>
  })}</div></section><div className="quiz-feedback-actions"><Link className="button button-ghost" to={`/courses/${course.id}/summaries/new`}>Review a summary</Link><Link className="button button-ghost" to={`/courses/${course.id}`}>Start a Study Session</Link><button className="button" onClick={onRetry}><RotateCcw size={15} /> Try again</button></div></div>
}
