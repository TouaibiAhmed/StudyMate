import type { ConceptStatus, ProgressAttempt, ProgressService, ProgressSession } from '../contracts/progress'
import { readLearningRecords } from './learning-records'

const progressData = {
  studyMinutes: 275,
  sessionsCompleted: 8,
  questionsAnswered: 23,
  concepts: [
    { id: 'gradient-descent', name: 'Gradient descent', course: 'Deep Learning', courseId: 'deep-learning', status: 'Good evidence' as const, evidence: '2 correct explanations across 3 activities', progress: 82, recommendedAction: 'Compare how learning rate changes the path to a minimum.', attempts: [{ id: 'attempt-gradient-1', date: 'Today, 9:36 AM', verdict: 'Correct' as const, answer: 'The optimizer uses the slope of the loss to update parameters toward lower error.', evidence: 'Connected the error signal to parameter updates.', confidence: 'High' as const }] },
    { id: 'backpropagation', name: 'Backpropagation', course: 'Deep Learning', courseId: 'deep-learning', status: 'Developing' as const, evidence: 'One partial explanation; keep connecting steps', progress: 56, recommendedAction: 'Explain how the chain rule moves error information backward.', attempts: [{ id: 'attempt-backprop-1', date: 'Wednesday, 2:10 PM', verdict: 'Partially correct' as const, answer: 'The network sends the error back through the layers.', evidence: 'Identified the direction, but did not explain gradients or the chain rule.', confidence: 'Medium' as const }] },
    { id: 'hypothesis-testing', name: 'Hypothesis testing', course: 'Statistics for Research', courseId: 'statistics', status: 'Needs practice' as const, evidence: 'Missed the decision rule in the last attempt', progress: 34, reason: 'Your last answer named the test but did not explain what the p-value changes.', practiceSessionId: 'statistics-session-1', recommendedAction: 'Retry a targeted question about p-values and decision rules.', attempts: [{ id: 'attempt-hypothesis-1', date: 'Yesterday, 5:16 PM', verdict: 'Partially correct' as const, answer: 'I would use a t-test because the samples are different.', evidence: 'Named a plausible test, but did not state how the p-value informs the decision.', confidence: 'Medium' as const }] },
    { id: 'confidence-intervals', name: 'Confidence intervals', course: 'Statistics for Research', courseId: 'statistics', status: 'Not enough evidence' as const, evidence: 'No completed explanation yet', progress: 8, reason: 'You have read the material but have not answered a question on this concept.', practiceSessionId: 'session-general-01', recommendedAction: 'Start a short explanation of what a confidence interval represents.', attempts: [] },
    { id: 'cell-signaling', name: 'Cell signaling', course: 'Cell Biology', courseId: 'biology', status: 'Developing' as const, evidence: 'A clear analogy; mechanism needs detail', progress: 48, recommendedAction: 'Add the receptor and second-messenger steps to your analogy.', attempts: [{ id: 'attempt-cell-1', date: 'Monday, 11:03 AM', verdict: 'Partially correct' as const, answer: 'A signal is like a message passed between cells.', evidence: 'The analogy was clear, but the mechanism was not yet specific.', confidence: 'Medium' as const }] },
    { id: 'market-structure', name: 'Market structure', course: 'Business Fundamentals', courseId: 'business-fundamentals', status: 'Not enough evidence' as const, evidence: 'Viewed one reading only', progress: 12, reason: 'Try explaining how competition changes pricing decisions.', practiceSessionId: 'session-general-01', recommendedAction: 'Begin with one example comparing a monopoly and a competitive market.', attempts: [] },
  ],
  recentSessions: [
    { id: 'deep-session-1', title: 'Loss functions and intuition', course: 'Deep Learning', date: 'Today, 9:20 AM', duration: '36 min', outcome: 'Connected error to parameter updates', verdict: 'Correct' as const, completed: true },
    { id: 'statistics-session-1', title: 'Choosing the right test', course: 'Statistics for Research', date: 'Yesterday, 4:45 PM', duration: '31 min', outcome: 'Named the test; decision rule needs work', verdict: 'Partially correct' as const, completed: true },
  ],
  weeklyActivity: [
    { day: 'Mon', sessions: 2, questions: 5, minutes: 58 },
    { day: 'Tue', sessions: 1, questions: 3, minutes: 31 },
    { day: 'Wed', sessions: 2, questions: 6, minutes: 65 },
    { day: 'Thu', sessions: 1, questions: 2, minutes: 35 },
    { day: 'Fri', sessions: 2, questions: 7, minutes: 80 },
    { day: 'Sat', sessions: 0, questions: 0, minutes: 0 },
    { day: 'Sun', sessions: 0, questions: 0, minutes: 0 },
  ],
}

export const mockProgressService: ProgressService = {
  async getProgress() {
    const records = readLearningRecords()
    const recordByTopic = new Map(records.map((record) => [record.topic.toLowerCase(), record]))
    const newSessions: ProgressSession[] = records.slice(-5).reverse().map((record) => ({ id: record.sessionId, title: record.topic, course: 'Focused study', date: 'Just now', duration: 'Local session', outcome: record.feedback.nextActivity, verdict: record.feedback.verdict === 'Correct' ? 'Correct' : record.feedback.verdict === 'Partially correct' ? 'Partially correct' : 'Needs review', completed: true }))
    const concepts = progressData.concepts.map((concept) => {
      const record = recordByTopic.get(concept.name.toLowerCase())
      if (!record) return { ...concept, attempts: concept.attempts.map((attempt) => ({ ...attempt })) }
      const status: ConceptStatus = record.feedback.verdict === 'Correct' ? 'Good evidence' : record.feedback.verdict === 'Partially correct' ? 'Developing' : 'Needs practice'
      const attempt: ProgressAttempt = { id: record.id, date: 'Just now', verdict: record.feedback.verdict === 'Correct' ? 'Correct' : record.feedback.verdict === 'Partially correct' ? 'Partially correct' : 'Needs review', answer: record.answer, evidence: record.feedback.strengths.join(' ') || 'Review the missing ideas below.', confidence: record.feedback.confidence }
      return {
        ...concept,
        status,
        progress: status === 'Good evidence' ? 100 : status === 'Developing' ? 65 : 35,
        evidence: `${record.feedback.verdict} evidence from your latest study attempt`,
        attempts: [attempt, ...concept.attempts],
      }
    })
    return {
      ...progressData,
      concepts,
      recentSessions: [...newSessions, ...progressData.recentSessions].map((session) => ({ ...session })),
      weeklyActivity: progressData.weeklyActivity.map((day) => ({ ...day })),
    }
  },
}
