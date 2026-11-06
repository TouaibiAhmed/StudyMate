import type { ExamAttempt, ExamQuestion, ExamResult, ExamService, PracticeExam } from '../contracts/exams'

const options = [
  { id: 'deep-learning', title: 'Deep Learning', concepts: [{ id: 'gradient-descent', title: 'Gradient descent' }, { id: 'backpropagation', title: 'Backpropagation' }, { id: 'regularization', title: 'Regularization' }] },
  { id: 'statistics', title: 'Statistics for Research', concepts: [{ id: 'hypothesis-testing', title: 'Hypothesis testing' }, { id: 'confidence-intervals', title: 'Confidence intervals' }, { id: 'distributions', title: 'Probability distributions' }] },
  { id: 'biology', title: 'Cell Biology', concepts: [{ id: 'cell-signaling', title: 'Cell signaling' }, { id: 'membranes', title: 'Cell membranes' }, { id: 'gene-expression', title: 'Gene expression' }] },
]

let nextExamNumber = 1
const questionBank: Record<string, ExamQuestion[]> = {
  'deep-learning': [
    { id: 'dl-q1', concept: 'Gradient descent', type: 'multiple-choice', prompt: 'What does gradient descent use to decide how model parameters should change?', options: ['The slope of the loss function', 'The number of training examples', 'The file size of the model', 'The order of the class labels'] },
    { id: 'dl-q2', concept: 'Backpropagation', type: 'short-answer', prompt: 'In one or two sentences, describe what backpropagation sends through a neural network.', },
    { id: 'dl-q3', concept: 'Regularization', type: 'multiple-choice', prompt: 'Which is a common purpose of regularization?', options: ['Reduce overfitting', 'Increase the number of labels', 'Remove the validation set', 'Guarantee perfect accuracy'] },
  ],
  statistics: [
    { id: 'stats-q1', concept: 'Hypothesis testing', type: 'multiple-choice', prompt: 'A small p-value is most directly evidence against which statement?', options: ['The null hypothesis', 'The sample mean', 'The data collection plan', 'The confidence interval'] },
    { id: 'stats-q2', concept: 'Confidence intervals', type: 'short-answer', prompt: 'What does a confidence interval communicate about an estimated quantity?', },
    { id: 'stats-q3', concept: 'Probability distributions', type: 'multiple-choice', prompt: 'What does a probability distribution describe?', options: ['How possible values and their probabilities are organized', 'Only the largest observed value', 'The order in which data was entered', 'A guaranteed future outcome'] },
  ],
  biology: [
    { id: 'bio-q1', concept: 'Cell signaling', type: 'multiple-choice', prompt: 'What is the role of a receptor in cell signaling?', options: ['Detect a signal and initiate a response', 'Produce every protein in a cell', 'Store genetic material', 'Break down all nutrients'] },
    { id: 'bio-q2', concept: 'Cell membranes', type: 'short-answer', prompt: 'Explain one way the cell membrane helps a cell maintain its internal conditions.', },
  ],
}
const attempts: ExamAttempt[] = [
  { id: 'exam-attempt-1', title: 'Deep learning foundations', course: 'Deep Learning', date: 'Yesterday, 10:15 AM', duration: '38 min', questionCount: 12, result: '9 of 12 useful answers', score: 76, completed: true },
  { id: 'exam-attempt-2', title: 'Statistics essentials', course: 'Statistics for Research', date: 'Monday, 5:20 PM', duration: '24 min', questionCount: 8, result: '6 of 8 useful answers', score: 75, completed: true },
]

const deepLearningResult: ExamResult = {
  examId: 'exam-attempt-1',
  title: 'Deep learning foundations',
  course: 'Deep Learning',
  courseId: 'deep-learning',
  completedQuestions: 3,
  totalQuestions: 3,
  timeUsed: '38 min',
  scoreLabel: 'Practice signal: 76%',
  counts: { Correct: 1, 'Partially correct': 1, Incorrect: 1, 'Insufficient evidence': 0 },
  questionResults: [
    { question: questionBank['deep-learning'][0], answer: 'The slope of the loss function', verdict: 'Correct', expectedIdeas: ['The gradient indicates the direction of steepest increase.', 'Updates move parameters toward lower loss.'], strengths: ['Selected the correct optimization signal.'], gaps: [], confidence: 'High' },
    { question: questionBank['deep-learning'][1], answer: 'It sends the error back through the model.', verdict: 'Partially correct', expectedIdeas: ['Gradients are calculated from the output backward.', 'The chain rule connects layer-by-layer contributions.'], strengths: ['Identified the backward direction.'], gaps: ['Name gradients and the chain rule to explain the mechanism.'], confidence: 'Medium' },
    { question: questionBank['deep-learning'][2], answer: 'Increase the number of labels', verdict: 'Incorrect', expectedIdeas: ['Regularization limits a model from fitting noise.', 'The goal is better generalization to unseen data.'], strengths: [], gaps: ['Review the relationship between model complexity and overfitting.'], confidence: 'High' },
  ],
  concepts: [
    { concept: 'Gradient descent', correct: 1, total: 1, summary: 'You connected the optimizer to the loss signal.', nextAction: 'Try comparing two learning rates.' },
    { concept: 'Backpropagation', correct: 0, total: 1, summary: 'The direction was right, but the mechanism needs more detail.', nextAction: 'Study the chain rule, then explain one layer update.' },
    { concept: 'Regularization', correct: 0, total: 1, summary: 'The purpose of regularization was confused with model inputs.', nextAction: 'Review overfitting and retry a focused question.' },
  ],
}

const statisticsResult: ExamResult = {
  examId: 'exam-attempt-2',
  title: 'Statistics essentials',
  course: 'Statistics for Research',
  courseId: 'statistics',
  completedQuestions: 2,
  totalQuestions: 2,
  timeUsed: '24 min',
  scoreLabel: 'Practice signal: 75%',
  counts: { Correct: 1, 'Partially correct': 1, Incorrect: 0, 'Insufficient evidence': 0 },
  questionResults: [
    { question: questionBank.statistics[0], answer: 'The null hypothesis', verdict: 'Correct', expectedIdeas: ['A small p-value is evidence against the null hypothesis under the test assumptions.'], strengths: ['Identified the correct reference statement.'], gaps: [], confidence: 'High' },
    { question: questionBank.statistics[1], answer: 'It gives a range for the answer.', verdict: 'Partially correct', expectedIdeas: ['The interval communicates uncertainty around an estimate.', 'The interpretation depends on the confidence procedure and repeated samples.'], strengths: ['Recognized that the result is a range.'], gaps: ['Explain uncertainty rather than treating the interval as a guaranteed location.'], confidence: 'Medium' },
  ],
  concepts: [
    { concept: 'Hypothesis testing', correct: 1, total: 1, summary: 'The decision rule was clear in this attempt.', nextAction: 'Practice choosing a test from a research question.' },
    { concept: 'Confidence intervals', correct: 0, total: 1, summary: 'You need a more precise interpretation of uncertainty.', nextAction: 'Review the confidence interval lesson and retry.' },
  ],
}

export const mockExamService: ExamService = {
  async getOptions() {
    return options.map((course) => ({ ...course, concepts: course.concepts.map((concept) => ({ ...concept })) }))
  },
  async listAttempts() {
    return attempts.map((attempt) => ({ ...attempt }))
  },
  async createExam(setup) {
    const course = options.find((item) => item.id === setup.courseId) ?? options[0]
    const topicTitles = course.concepts.filter((topic) => setup.topicIds.includes(topic.id)).map((topic) => topic.title)
    const questions = (questionBank[course.id] ?? []).filter((question) => setup.topicIds.includes(course.concepts.find((topic) => topic.title === question.concept)?.id ?? '')).length
      ? (questionBank[course.id] ?? []).filter((question) => setup.topicIds.includes(course.concepts.find((topic) => topic.title === question.concept)?.id ?? ''))
      : questionBank[course.id] ?? []
    const exam: PracticeExam = { ...setup, id: `practice-exam-${nextExamNumber++}`, title: `${course.title} practice exam`, course: course.title, topicTitles, questions: questions.slice(0, setup.questionCount) }
    createdExams.push(exam)
    persistCreatedExams()
    return { ...exam, topicTitles: [...exam.topicTitles] }
  },
  async getExam(id) {
    const exam = createdExams.find((item) => item.id === id)
    return exam ? { ...exam, topicTitles: [...exam.topicTitles], questions: exam.questions.map((question) => ({ ...question, options: question.options ? [...question.options] : undefined })) } : undefined
  },
  async getResult(id) {
    const predefined = id === deepLearningResult.examId ? deepLearningResult : id === statisticsResult.examId ? statisticsResult : undefined
    if (predefined) return cloneResult(predefined)
    const exam = createdExams.find((item) => item.id === id)
    if (!exam) return undefined
    const result = createMockResult(exam)
    if (!attempts.some((attempt) => attempt.id === exam.id)) {
      attempts.unshift({ id: exam.id, title: exam.title, course: exam.course, date: 'Just now', duration: result.timeUsed, questionCount: exam.questions.length, result: result.scoreLabel, score: undefined, completed: true })
    }
    return result
  },
}

const createdExams: PracticeExam[] = readCreatedExams()

function readCreatedExams(): PracticeExam[] {
  try {
    const saved = localStorage.getItem('studymate:created-exams')
    return saved ? JSON.parse(saved) as PracticeExam[] : []
  } catch {
    return []
  }
}

function persistCreatedExams() {
  try {
    localStorage.setItem('studymate:created-exams', JSON.stringify(createdExams))
  } catch {
    // The exam remains available in the current mock session if local storage is unavailable.
  }
}

function cloneResult(result: ExamResult): ExamResult {
  return { ...result, counts: { ...result.counts }, questionResults: result.questionResults.map((item) => ({ ...item, question: { ...item.question, options: item.question.options ? [...item.question.options] : undefined }, expectedIdeas: [...item.expectedIdeas], strengths: [...item.strengths], gaps: [...item.gaps] })), concepts: result.concepts.map((concept) => ({ ...concept })) }
}

function createMockResult(exam: PracticeExam): ExamResult {
  const questionResults = exam.questions.map((question, index) => ({ question, answer: index === 0 ? question.options?.[0] ?? 'No answer submitted' : 'No answer submitted', verdict: index === 0 ? 'Correct' as const : 'Insufficient evidence' as const, expectedIdeas: ['Connect the response to the central concept.', 'Use one concrete reason or example.'], strengths: index === 0 ? ['You selected a plausible starting point.'] : [], gaps: index === 0 ? [] : ['Add enough reasoning for the idea to be evaluated.'], confidence: index === 0 ? 'Medium' as const : 'Low' as const }))
  return { examId: exam.id, title: exam.title, course: exam.course, courseId: exam.courseId, completedQuestions: questionResults.length, totalQuestions: questionResults.length, timeUsed: `${exam.timeLimit} min`, scoreLabel: 'Practice signal: not scored', counts: { Correct: questionResults.filter((item) => item.verdict === 'Correct').length, 'Partially correct': 0, Incorrect: 0, 'Insufficient evidence': questionResults.filter((item) => item.verdict === 'Insufficient evidence').length }, questionResults, concepts: exam.topicTitles.map((concept) => ({ concept, correct: 0, total: 1, summary: 'This mock result does not have enough evidence yet.', nextAction: 'Retry a targeted study session for this concept.' })) }
}
