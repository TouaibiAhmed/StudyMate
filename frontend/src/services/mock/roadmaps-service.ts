import type { CreateRoadmapInput, RoadmapDetail, RoadmapService, RoadmapSummary } from '../contracts/roadmaps'

const roadmapDetails: RoadmapDetail[] = [
  {
    id: 'data-analyst', role: 'Data Analyst', category: 'Data',
    description: 'Turn messy questions and datasets into clear, decision-ready insights.',
    topicCount: 8, coreTopics: ['Spreadsheets', 'SQL', 'Statistics', 'Data storytelling'], optionalTopics: ['Python', 'Experiment design'], progress: 42, source: 'Curated by Study Partner', color: 'purple',
    note: 'A practical foundation for entry-level analyst work. Adapt the sequence to the tools used in your target industry.',
    topics: [
      { id: 'spreadsheets', name: 'Spreadsheets and cleaning', completed: true }, { id: 'sql', name: 'SQL foundations', completed: true }, { id: 'statistics', name: 'Descriptive statistics', completed: false }, { id: 'visualization', name: 'Data visualization', completed: false }, { id: 'storytelling', name: 'Data storytelling', completed: false }, { id: 'python', name: 'Python for analysis', optional: true, completed: false }, { id: 'experiments', name: 'Experiment design', optional: true, completed: false }, { id: 'portfolio', name: 'Portfolio case study', completed: false },
    ],
  },
  {
    id: 'backend-developer', role: 'Backend Developer', category: 'Engineering',
    description: 'Build reliable services, APIs, and data layers that support real products.',
    topicCount: 9, coreTopics: ['HTTP and APIs', 'Databases', 'Testing', 'Deployment'], optionalTopics: ['Distributed systems', 'Cloud fundamentals'], progress: 18, source: 'Curated by Study Partner', color: 'green',
    note: 'Use this as a map of ideas to practice, not a checklist for every backend job.',
    topics: ['HTTP and APIs', 'SQL databases', 'Authentication', 'Testing services', 'Caching', 'Deployment', 'Distributed systems', 'Cloud fundamentals', 'Capstone API'].map((name, index) => ({ id: name.toLowerCase().replaceAll(' ', '-'), name, optional: index > 5 && index < 8, completed: index < 2 })),
  },
  {
    id: 'machine-learning-engineer', role: 'Machine Learning Engineer', category: 'Machine learning',
    description: 'Connect modeling fundamentals with production data and evaluation practice.',
    topicCount: 10, coreTopics: ['Python', 'Modeling', 'Evaluation', 'MLOps'], optionalTopics: ['Deep learning', 'Research reading'], progress: 61, source: 'Curated by Study Partner', color: 'orange',
    note: 'The production topics are as important as model training. Keep a project running alongside the theory.',
    topics: ['Python for ML', 'Data preparation', 'Supervised learning', 'Model evaluation', 'Feature engineering', 'Serving models', 'Monitoring', 'MLOps foundations', 'Deep learning', 'Research reading'].map((name, index) => ({ id: name.toLowerCase().replaceAll(' ', '-'), name, optional: index > 7, completed: index < 6 })),
  },
  {
    id: 'product-operations', role: 'Product Operations Specialist', category: 'Business',
    description: 'Coordinate product knowledge, customer insight, and operational systems.',
    topicCount: 7, coreTopics: ['Product discovery', 'Process design', 'Analytics', 'Communication'], optionalTopics: ['SQL basics', 'Change management'], progress: 0, source: 'Curated by Study Partner', color: 'blue',
    note: 'This path emphasizes collaboration and operational clarity for cross-functional product teams.',
    topics: ['Product discovery', 'Process design', 'Product analytics', 'Documentation', 'Stakeholder communication', 'SQL basics', 'Change management'].map((name, index) => ({ id: name.toLowerCase().replaceAll(' ', '-'), name, optional: index > 4, completed: false })),
  },
]

export const mockRoadmapService: RoadmapService = {
  async listRoadmaps() {
    return roadmapDetails.map((roadmap): RoadmapSummary => ({
      id: roadmap.id,
      role: roadmap.role,
      category: roadmap.category,
      description: roadmap.description,
      topicCount: roadmap.topicCount,
      coreTopics: [...roadmap.coreTopics],
      optionalTopics: [...roadmap.optionalTopics],
      progress: roadmap.progress,
      source: roadmap.source,
      color: roadmap.color,
    }))
  },
  async getRoadmap(id) {
    const roadmap = roadmapDetails.find((item) => item.id === id)
    return roadmap ? { ...roadmap, topics: roadmap.topics.map((topic) => ({ ...topic })) } : undefined
  },
  async createRoadmap(input: CreateRoadmapInput) {
    const roadmap: RoadmapDetail = {
      id: `generated-${input.role.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`,
      role: input.role, category: input.category,
      description: `A starting point for building toward ${input.role.toLowerCase()} work, shaped around: ${input.goal}.`,
      topicCount: 6, coreTopics: ['Role fundamentals', 'Tools and workflows', 'Portfolio practice', 'Communication'], optionalTopics: ['Adjacent skills', 'Interview preparation'], progress: 0, source: 'AI-generated mock', color: 'purple',
      note: 'This generated roadmap is a mock suggestion. Verify it against current job descriptions, mentors, and official learning resources; it is not an official career requirement.',
      topics: ['Role fundamentals', 'Tools and workflows', 'Portfolio practice', 'Communication', 'Adjacent skills', 'Interview preparation'].map((name, index) => ({ id: `generated-topic-${index}`, name, optional: index > 3, completed: false })),
    }
    roadmapDetails.unshift(roadmap)
    return { ...roadmap, topics: roadmap.topics.map((topic) => ({ ...topic })) }
  },
}
