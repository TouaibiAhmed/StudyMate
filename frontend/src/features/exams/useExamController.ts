import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ExamQuestion, PracticeExam } from '../../services/contracts/exams'

type ExamPersistedState = {
  answers: Record<string, string>
  flagged: string[]
  currentIndex: number
  remainingSeconds: number
}

const storageKey = (examId: string) => `studymate:exam:${examId}`

function computeInitialSeconds(exam: PracticeExam): number {
  if (exam.deadlineAt) {
    const remaining = Math.round((new Date(exam.deadlineAt).getTime() - Date.now()) / 1000)
    return Math.max(remaining, 0)
  }
  return exam.timeLimit * 60
}

function readState(exam: PracticeExam): ExamPersistedState {
  const serverSeconds = computeInitialSeconds(exam)
  const fallback = { answers: {}, flagged: [], currentIndex: 0, remainingSeconds: serverSeconds }
  try {
    const saved = sessionStorage.getItem(storageKey(exam.id))
    if (!saved) return fallback
    const parsed = JSON.parse(saved) as Partial<ExamPersistedState>
    return {
      answers: parsed.answers ?? {},
      flagged: parsed.flagged ?? [],
      currentIndex: Math.min(Math.max(parsed.currentIndex ?? 0, 0), Math.max(exam.questions.length - 1, 0)),
      // Always prefer server deadline over cached value to prevent clock drift exploits
      remainingSeconds: exam.deadlineAt ? serverSeconds : Math.max(parsed.remainingSeconds ?? fallback.remainingSeconds, 0),
    }
  } catch {
    return fallback
  }
}

export function useExamController(exam: PracticeExam) {
  const initial = useMemo(() => readState(exam), [exam])
  const [answers, setAnswers] = useState(initial.answers)
  const [flagged, setFlagged] = useState(initial.flagged)
  const [currentIndex, setCurrentIndex] = useState(initial.currentIndex)
  const [remainingSeconds, setRemainingSeconds] = useState(initial.remainingSeconds)
  const currentQuestion = exam.questions[currentIndex]

  useEffect(() => {
    const state: ExamPersistedState = { answers, flagged, currentIndex, remainingSeconds }
    sessionStorage.setItem(storageKey(exam.id), JSON.stringify(state))
  }, [answers, currentIndex, exam.id, flagged, remainingSeconds])

  useEffect(() => {
    if (remainingSeconds <= 0) return
    const timer = window.setInterval(() => {
      if (exam.deadlineAt) {
        // Re-derive from server deadline on every tick to prevent drift
        const remaining = Math.round((new Date(exam.deadlineAt).getTime() - Date.now()) / 1000)
        setRemainingSeconds(Math.max(remaining, 0))
      } else {
        setRemainingSeconds((seconds) => Math.max(seconds - 1, 0))
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [exam.deadlineAt, remainingSeconds])

  const answerQuestion = useCallback((answer: string) => {
    if (!currentQuestion) return
    setAnswers((current) => ({ ...current, [currentQuestion.id]: answer }))
  }, [currentQuestion])
  const toggleFlag = useCallback(() => {
    if (!currentQuestion) return
    setFlagged((current) => current.includes(currentQuestion.id) ? current.filter((id) => id !== currentQuestion.id) : [...current, currentQuestion.id])
  }, [currentQuestion])
  const goTo = useCallback((index: number) => setCurrentIndex(Math.min(Math.max(index, 0), exam.questions.length - 1)), [exam.questions.length])
  const answeredCount = exam.questions.filter((question) => Boolean(answers[question.id]?.trim())).length
  const formatTime = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`

  return {
    answers,
    flagged,
    currentIndex,
    currentQuestion,
    remainingSeconds,
    formatTime,
    answeredCount,
    answerQuestion,
    toggleFlag,
    goTo,
    isFirst: currentIndex === 0,
    isLast: currentIndex === exam.questions.length - 1,
  }
}

export type ExamQuestionView = ExamQuestion
