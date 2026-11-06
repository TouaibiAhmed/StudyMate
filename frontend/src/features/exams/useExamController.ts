import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ExamQuestion, PracticeExam } from '../../services/contracts/exams'

type ExamPersistedState = {
  answers: Record<string, string>
  flagged: string[]
  currentIndex: number
  remainingSeconds: number
}

const storageKey = (examId: string) => `studymate:exam:${examId}`

function readState(exam: PracticeExam): ExamPersistedState {
  const fallback = { answers: {}, flagged: [], currentIndex: 0, remainingSeconds: exam.timeLimit * 60 }
  try {
    const saved = sessionStorage.getItem(storageKey(exam.id))
    if (!saved) return fallback
    const parsed = JSON.parse(saved) as Partial<ExamPersistedState>
    return {
      answers: parsed.answers ?? {},
      flagged: parsed.flagged ?? [],
      currentIndex: Math.min(Math.max(parsed.currentIndex ?? 0, 0), Math.max(exam.questions.length - 1, 0)),
      remainingSeconds: Math.max(parsed.remainingSeconds ?? fallback.remainingSeconds, 0),
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
    const timer = window.setInterval(() => setRemainingSeconds((seconds) => Math.max(seconds - 1, 0)), 1000)
    return () => window.clearInterval(timer)
  }, [remainingSeconds])

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
