import type { StudyFeedback, StudyQuestion, StudySessionDetail, StudySessionService } from '../contracts/sessions'

const reactQuestions: StudyQuestion[] = [
  {
    id: 'compound-context',
    topic: 'Compound components',
    prompt: 'Imagine you are designing a Tabs component with <Tabs.List> and <Tabs.Panel> children. How would the child components know which tab is active without passing the active tab through every layer manually?',
    context: 'Focus on the relationship between a provider, shared context, and the components that consume it. A short answer in your own words is enough.',
    hints: ['Think about a shared value that can be read by descendants of a parent component.', 'The parent can provide activeTab and a setter; children can consume those values where they render.', 'React context lets compound children read the nearest provider without prop drilling.'],
    explanation: 'A parent Tabs component can provide activeTab and setActiveTab through React context. Tabs.List and Tabs.Panel consume that context, so they share the same state while remaining declaratively nested.',
    sources: [{ title: 'Advanced React patterns · Compound components', page: 17, excerpt: 'Compound children can coordinate through a context owned by their parent.' }, { title: 'Advanced React patterns · Shared state', page: 19, excerpt: 'Keep the state owner close to the public component API.' }],
    scenarios: [
      { verdict: 'Partially correct', strengths: ['You identified shared state as the key to avoiding prop drilling.'], missingIdeas: ['Name the mechanism the children use to read that shared state.'], misconception: 'A shared module variable would not scope state to a Tabs tree.', confidence: 'Medium', nextActivity: 'Add React context and describe what the provider exposes.' },
      { verdict: 'Correct', strengths: ['You connected the provider to the nested children.', 'You explained how context keeps the API declarative.'], missingIdeas: [], confidence: 'High', nextActivity: 'Continue by sketching the context value shape.' },
      { verdict: 'Insufficient evidence', strengths: ['You focused on keeping the children independent.'], missingIdeas: ['Explain where activeTab lives and how Tabs.Panel reads it.'], confidence: 'Low', nextActivity: 'Review the shared state source, then retry in your own words.' },
    ],
  },
  {
    id: 'context-value',
    topic: 'Context boundaries',
    prompt: 'What should the Tabs context expose to make both a tab button and a panel respond to the same selection?',
    context: 'Keep your answer concrete: name the values and the job each one performs.',
    hints: ['One value describes the current selection; another changes it.', 'Think about a stable object passed to the provider.'],
    explanation: 'The context can expose activeTab and setActiveTab, plus any stable identifiers or registration helpers the compound children need.',
    sources: [{ title: 'Advanced React patterns · Shared state', page: 19, excerpt: 'Keep the state owner close to the public component API.' }],
    scenarios: [
      { verdict: 'Incorrect', strengths: ['You recognized the context needs to carry information.'], missingIdeas: ['Separate the current value from the function that changes it.'], misconception: 'A ref alone does not trigger the panel to render again.', confidence: 'Medium', nextActivity: 'Retry after naming the state value and setter.' },
      { verdict: 'Correct', strengths: ['You named both the active value and its update function.'], missingIdeas: [], confidence: 'High', nextActivity: 'Finish with a quick review of controlled versus uncontrolled state.' },
    ],
  },
]

const sessions: Record<string, StudySessionDetail> = {
  'session-react-02': {
    id: 'session-react-02',
    course: 'Advanced React patterns',
    courseId: 'react',
    topic: 'Compound components',
    goal: 'Explain how a compound component API can share state without making each child tightly coupled.',
    mode: 'Course-grounded',
    activityNumber: 2,
    activityTotal: 5,
    prompt: 'Imagine you are designing a Tabs component with <Tabs.List> and <Tabs.Panel> children. How would the child components know which tab is active without passing the active tab through every layer manually?',
    context: 'Focus on the relationship between a provider, shared context, and the components that consume it. A short answer in your own words is enough.',
    hints: [
      'Think about a shared value that can be read by descendants of a parent component.',
      'The parent can provide activeTab and a setter; children can consume those values where they render.',
      'React context lets compound children read the nearest provider without prop drilling.',
    ],
    explanation: 'A parent Tabs component can provide activeTab and setActiveTab through React context. Tabs.List and Tabs.Panel consume that context, so they share the same state while remaining declaratively nested and independent of the exact tree depth.',
    sources: [
      { title: 'Advanced React patterns · Compound components', page: 17, excerpt: 'Compound children can coordinate through a context owned by their parent.' },
      { title: 'Advanced React patterns · Shared state', page: 19, excerpt: 'Keep the state owner close to the public component API.' },
    ],
    questions: reactQuestions,
  },
  'deep-session-1': {
    id: 'deep-session-1',
    course: 'Deep Learning',
    courseId: 'deep-learning',
    topic: 'Loss functions',
    goal: 'Connect the shape of a loss function to how a model learns from its errors.',
    mode: 'Course-grounded',
    activityNumber: 1,
    activityTotal: 4,
    prompt: 'Why does a model need a loss function during training, and what would happen if the loss stayed the same after several updates?',
    context: 'Describe the feedback loop between a prediction, an error measure, and a parameter update.',
    hints: ['The loss turns an error into a number the optimizer can compare.', 'If the loss does not change, the updates are not improving the objective.'],
    explanation: 'A loss function measures how far predictions are from the target. The optimizer uses that signal to adjust parameters; if the loss stays flat, the model is no longer making useful progress or the updates need attention.',
    sources: [{ title: 'Deep Learning · Loss functions and intuition', page: 8, excerpt: 'The loss gives training a measurable direction.' }],
    questions: [{
      id: 'loss-feedback',
      topic: 'Loss functions',
      prompt: 'Why does a model need a loss function during training, and what would happen if the loss stayed the same after several updates?',
      context: 'Describe the feedback loop between a prediction, an error measure, and a parameter update.',
      hints: ['The loss turns an error into a number the optimizer can compare.', 'If the loss does not change, the updates are not improving the objective.'],
      explanation: 'A loss function measures how far predictions are from the target. The optimizer uses that signal to adjust parameters; if the loss stays flat, the model is no longer making useful progress.',
      sources: [{ title: 'Deep Learning · Loss functions and intuition', page: 8, excerpt: 'The loss gives training a measurable direction.' }],
      scenarios: [{ verdict: 'Correct', strengths: ['You described the feedback loop from prediction to update.', 'You connected a flat loss to stalled learning.'], missingIdeas: [], confidence: 'High', nextActivity: 'Compare how two different loss functions change the learning signal.' }],
    }],
  },
  'session-general-01': {
    id: 'session-general-01',
    course: 'Independent study',
    topic: 'Explaining complex ideas',
    goal: 'Practice making a technical explanation clear to someone new to the subject.',
    mode: 'General knowledge',
    activityNumber: 1,
    activityTotal: 3,
    prompt: 'Choose a technical idea you understand well. How would you explain it using one concrete example and one analogy?',
    context: 'There is no single correct answer. Aim for clarity, not completeness.',
    hints: ['Start with what the idea helps someone do.', 'Use an example that has a familiar outcome.'],
    explanation: 'Strong explanations establish the practical idea first, then use an example or analogy to make the relationship memorable. The goal is to reduce cognitive load without losing the core truth.',
    sources: [],
    questions: [{
      id: 'clear-explanation',
      topic: 'Explaining complex ideas',
      prompt: 'Choose a technical idea you understand well. How would you explain it using one concrete example and one analogy?',
      context: 'There is no single correct answer. Aim for clarity, not completeness.',
      hints: ['Start with what the idea helps someone do.', 'Use an example that has a familiar outcome.'],
      explanation: 'Strong explanations establish the practical idea first, then use an example or analogy to make the relationship memorable.',
      sources: [],
      scenarios: [{ verdict: 'Insufficient evidence', strengths: ['You started with a useful idea.'], missingIdeas: ['Add both a concrete example and an analogy.'], confidence: 'Low', nextActivity: 'Retry with one familiar example and one comparison.' }],
    }],
  },
}

export const mockStudySessionService: StudySessionService = {
  async getSession(sessionId) {
    return sessions[sessionId] ? { ...sessions[sessionId] } : { ...sessions['session-general-01'], id: sessionId }
  },
  async evaluateAnswer(sessionId, questionId, attempt) {
    const session = sessions[sessionId] ?? sessions['session-general-01']
    const question = session.questions.find((item) => item.id === questionId) ?? session.questions[0]
    return { ...question.scenarios[Math.min(attempt, question.scenarios.length - 1)] } as StudyFeedback
  },
}
