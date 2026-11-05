import { useEffect, useMemo, useState } from 'react'
import { studySessionService } from '../../services/api-client'
import type { AnswerRecord, StudyFeedback, StudyQuestion, StudySessionDetail } from '../../services/contracts/sessions'

export type SessionControllerState = {
  answer: string
  questionIndex: number
  hintLevel: number
  explanationVisible: boolean
  feedback?: StudyFeedback
  history: AnswerRecord[]
  summaryVisible: boolean
  submissionError?: string
}

const initialState: SessionControllerState = {
  answer: '',
  questionIndex: 0,
  hintLevel: 0,
  explanationVisible: false,
  history: [],
  summaryVisible: false,
}

export function useStudySessionController(session?: StudySessionDetail) {
  const [state, setState] = useState<SessionControllerState>(() => readState(session?.id))
  const [evaluating, setEvaluating] = useState(false)

  useEffect(() => {
    if (session?.id) window.sessionStorage.setItem(`study-session-flow:${session.id}`, JSON.stringify(state))
  }, [session?.id, state])

  const question: StudyQuestion | undefined = session?.questions[state.questionIndex]
  const isLastQuestion = Boolean(session && question && state.questionIndex >= session.questions.length - 1)
  const progress = session && question ? ((state.questionIndex + 1) / session.questions.length) * 100 : 0

  function update(update: Partial<SessionControllerState>) {
    setState((current) => ({ ...current, ...update }))
  }

  async function submitAnswer() {
    if (!session || !question || !state.answer.trim() || evaluating) return
    setEvaluating(true)
    try {
      const feedback = await studySessionService.evaluateAnswer(session.id, question.id, state.history.filter((record) => record.questionId === question.id).length)
      setState((current) => ({
        ...current,
        feedback,
        submissionError: undefined,
        history: [...current.history, { questionId: question.id, questionTopic: question.topic, answer: current.answer.trim(), feedback }],
      }))
    } catch {
      setState((current) => ({ ...current, submissionError: 'The mock feedback could not be prepared. Please try submitting again.' }))
    } finally {
      setEvaluating(false)
    }
  }

  function retry() {
    update({ answer: '', feedback: undefined, submissionError: undefined, hintLevel: 0, explanationVisible: false })
  }

  function continueToNext() {
    if (!session || isLastQuestion) {
      update({ summaryVisible: true })
      return
    }
    update({ questionIndex: state.questionIndex + 1, answer: '', feedback: undefined, submissionError: undefined, hintLevel: 0, explanationVisible: false })
  }

  function requestHint() {
    if (question) update({ hintLevel: Math.min(state.hintLevel + 1, question.hints.length) })
  }

  const summary = useMemo(() => {
    const records = state.history
    return {
      strengths: unique(records.flatMap((record) => record.feedback.strengths)),
      gaps: unique(records.flatMap((record) => record.feedback.missingIdeas)),
      revision: records.at(-1)?.feedback.nextActivity ?? 'Start with one short study activity and explain your reasoning out loud.',
    }
  }, [state.history])

  return { state, question, progress, isLastQuestion, evaluating, update, submitAnswer, retry, continueToNext, requestHint, summary }
}

function unique(items: string[]) {
  return [...new Set(items)]
}

function readState(sessionId?: string): SessionControllerState {
  if (!sessionId) return initialState
  try {
    const saved = window.sessionStorage.getItem(`study-session-flow:${sessionId}`)
    return saved ? { ...initialState, ...JSON.parse(saved) as Partial<SessionControllerState> } : initialState
  } catch {
    return initialState
  }
}
