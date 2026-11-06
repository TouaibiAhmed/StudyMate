import type { Quiz, QuizQuestionType, Summary, StudyToolArtifact, StudyToolsService } from '../contracts/study-tools'

const storageKey = 'studymate:study-tool-artifacts'
const summaryStorageKey = 'studymate:summaries'
const quizStorageKey = 'studymate:quizzes'
let nextArtifactNumber = 1

const seedArtifacts: StudyToolArtifact[] = [
  {
    id: 'summary-deep-1',
    courseId: 'deep-learning',
    kind: 'summary',
    title: 'Neural networks and optimization summary',
    createdAt: '2026-11-03T10:00:00.000Z',
    sourceDocumentIds: ['document-deep-platform', 'document-deep-1'],
    description: 'A mock overview of forward passes, loss functions, gradients, and practical revision cues.',
  },
]

const seedSummaries: Summary[] = [{
  id: 'summary-deep-demo',
  courseId: 'deep-learning',
  title: 'Neural networks and optimization summary',
  createdAt: '2026-11-03T10:00:00.000Z',
  sourceDocumentIds: ['document-deep-platform', 'document-deep-1'],
  topicIds: ['backpropagation', 'regularization'],
  sourceLabel: 'Platform primer + your notes',
  length: 'Medium',
  language: 'English',
  structure: 'Key Concepts',
  isMock: true,
  sections: [
    { heading: 'Key concepts', points: ['A neural network learns a mapping by adjusting parameters to reduce a loss function.', 'Backpropagation applies the chain rule to calculate how each parameter contributes to the error.', 'Regularization improves generalization by discouraging overly complex solutions.'] },
    { heading: 'Important points', points: ['Gradient descent updates parameters in the opposite direction of the gradient.', 'Learning rate, batch size, and initialization strongly affect optimization behaviour.'] },
    { heading: 'Takeaways', points: ['Start revision by connecting the forward pass, loss, gradient, and parameter update into one loop.', 'Use a small worked example to check the direction of every update.'] },
  ],
}]

const questionBank: Record<string, Array<Quiz['questions'][number]>> = {
  'deep-learning': [
    { id: 'dl-q1', prompt: 'What does backpropagation calculate in a neural network?', type: 'Multiple Choice', options: ['Parameter gradients', 'The dataset size', 'The learning rate schedule', 'The number of layers'], answer: { value: 'Parameter gradients', isCorrect: true }, topicId: 'backpropagation' },
    { id: 'dl-q2', prompt: 'Gradient descent updates parameters in the direction of the gradient.', type: 'True/False', options: ['True', 'False'], answer: { value: 'False', isCorrect: true }, topicId: 'gradient-descent' },
    { id: 'dl-q3', prompt: 'In one sentence, explain why regularization can improve generalization.', type: 'Short Answer', answer: { value: 'It discourages overly complex solutions and helps reduce overfitting.', isCorrect: true }, topicId: 'regularization' },
    { id: 'dl-q4', prompt: 'Which component measures the difference between predictions and target values?', type: 'Multiple Choice', options: ['Loss function', 'Activation function', 'Optimizer state', 'Batch sampler'], answer: { value: 'Loss function', isCorrect: true }, topicId: 'gradient-descent' },
    { id: 'dl-q5', prompt: 'A lower training loss always guarantees better performance on unseen data.', type: 'True/False', options: ['True', 'False'], answer: { value: 'False', isCorrect: true }, topicId: 'regularization' },
    { id: 'dl-q6', prompt: 'What is the role of an activation function?', type: 'Multiple Choice', options: ['Add non-linearity', 'Store the dataset', 'Choose the batch size', 'Measure study time'], answer: { value: 'Add non-linearity', isCorrect: true }, topicId: 'cnn-architecture' },
  ],
}

function read(): StudyToolArtifact[] {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored ? JSON.parse(stored) as StudyToolArtifact[] : seedArtifacts.map((artifact) => ({ ...artifact, sourceDocumentIds: [...artifact.sourceDocumentIds] }))
  } catch {
    return [...seedArtifacts]
  }
}

function write(artifacts: StudyToolArtifact[]) {
  localStorage.setItem(storageKey, JSON.stringify(artifacts))
}
function readSummaries(): Summary[] {
  try {
    const stored = localStorage.getItem(summaryStorageKey)
    return stored ? JSON.parse(stored) as Summary[] : seedSummaries.map((summary) => ({ ...summary, sourceDocumentIds: [...summary.sourceDocumentIds], sections: summary.sections.map((section) => ({ ...section, points: [...section.points] })) }))
  } catch {
    return [...seedSummaries]
  }
}
function writeSummaries(summaries: Summary[]) { localStorage.setItem(summaryStorageKey, JSON.stringify(summaries)) }
function readQuizzes(): Quiz[] {
  try { return JSON.parse(localStorage.getItem(quizStorageKey) || '[]') as Quiz[] } catch { return [] }
}
function writeQuizzes(quizzes: Quiz[]) { localStorage.setItem(quizStorageKey, JSON.stringify(quizzes)) }

export const mockStudyToolsService: StudyToolsService = {
  async listArtifacts(courseId) {
    return read().filter((artifact) => artifact.courseId === courseId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  async createArtifact(courseId, kind, sourceDocumentIds) {
    const isSummary = kind === 'summary'
    const artifact: StudyToolArtifact = {
      id: `${kind}-${courseId}-${nextArtifactNumber++}`,
      courseId,
      kind,
      title: isSummary ? 'Course overview summary' : 'Course practice quiz',
      createdAt: new Date().toISOString(),
      sourceDocumentIds,
      description: isSummary
        ? 'Mock summary ready to open. It highlights the main ideas from the selected course sources.'
        : 'Mock quiz ready to open. It contains practice questions based on the selected course sources.',
    }
    const artifacts = [artifact, ...read()]
    write(artifacts)
    return artifact
  },
  async listSummaries(courseId) {
    return readSummaries().filter((summary) => summary.courseId === courseId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  async generateSummary(courseId, options) {
    const summary: Summary = {
      id: `summary-${courseId}-${Date.now()}`,
      courseId,
      title: 'New course summary',
      createdAt: new Date().toISOString(),
      sourceDocumentIds: options.sourceDocumentIds,
      topicIds: options.topicIds,
      sourceLabel: options.sourceDocumentIds.length === 1 ? '1 selected course source' : `${options.sourceDocumentIds.length} selected course sources`,
      length: options.length,
      language: options.language,
      structure: options.structure,
      isMock: true,
      sections: [
        { heading: 'Key concepts', points: ['This is a predefined mock summary for the selected course.', 'The selected files are shown as sources only; no document text has been extracted or analysed.'] },
        { heading: 'Definitions', points: ['Learning objective: a focused idea to understand and practise.', 'Evidence: an explanation or example you can use to check your understanding.'] },
        { heading: 'Important points', points: ['Compare these points with the original course materials while revising.', `This ${options.length.toLowerCase()} summary is presented in ${options.language}.`] },
        { heading: 'Takeaways', points: ['Use the course materials as the source of truth and treat this demo as a study scaffold.'] },
      ],
    }
    writeSummaries([summary, ...readSummaries()])
    return summary
  },
  async updateSummary(summaryId, updates) {
    const summaries = readSummaries()
    const index = summaries.findIndex((summary) => summary.id === summaryId)
    if (index < 0) return undefined
    summaries[index] = { ...summaries[index], ...updates }
    writeSummaries(summaries)
    return summaries[index]
  },
  async deleteSummary(summaryId) {
    writeSummaries(readSummaries().filter((summary) => summary.id !== summaryId))
  },
  async listQuizzes(courseId) {
    return readQuizzes().filter((quiz) => quiz.courseId === courseId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  async generateQuiz(courseId, options) {
    const bank = questionBank[courseId] ?? []
    const focused = options.topicIds.length ? bank.filter((question) => question.topicId && options.topicIds.includes(question.topicId)) : bank
    const pool = focused.length ? focused : bank
    const types = options.questionTypes
    const questions = Array.from({ length: options.questionCount }, (_, index) => {
      const source = pool[index % Math.max(pool.length, 1)] ?? { id: `mock-${index}`, prompt: 'What is one important idea from this course?', type: 'Short Answer' as QuizQuestionType, answer: { value: 'Review the course materials.', isCorrect: true } }
      const selectedType = types[index % types.length] ?? source.type
      return { ...source, id: `${source.id}-${index}`, type: selectedType, options: selectedType === 'Short Answer' ? undefined : source.options ?? ['True', 'False'] }
    })
    const quiz: Quiz = { id: `quiz-${courseId}-${Date.now()}`, courseId, title: 'Course practice quiz', createdAt: new Date().toISOString(), sourceDocumentIds: options.sourceDocumentIds, topicIds: options.topicIds, sourceLabel: `${options.sourceDocumentIds.length} selected course source${options.sourceDocumentIds.length === 1 ? '' : 's'}`, questionCount: options.questionCount, difficulty: options.difficulty, questionTypes: options.questionTypes, language: options.language, isMock: true, questions }
    writeQuizzes([quiz, ...readQuizzes()])
    return quiz
  },
  async updateQuiz(quizId, updates) {
    const quizzes = readQuizzes()
    const index = quizzes.findIndex((quiz) => quiz.id === quizId)
    if (index < 0) return undefined
    quizzes[index] = { ...quizzes[index], ...updates }
    writeQuizzes(quizzes)
    return quizzes[index]
  },
  async deleteQuiz(quizId) {
    writeQuizzes(readQuizzes().filter((quiz) => quiz.id !== quizId))
  },
}
