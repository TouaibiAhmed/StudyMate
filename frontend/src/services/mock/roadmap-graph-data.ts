import type { RoadmapGraphData } from '../contracts/roadmaps'

const topic = (id: string, title: string, description: string, status: 'Not started' | 'In progress' | 'Completed', progress: number, prerequisites: string[], resources: string[], optional = false, x = 0, y = 0) => ({ id, title, description, status, progress, prerequisites, resources, optional, position: { x, y } })

export const roadmapGraphData: Record<string, RoadmapGraphData> = {
  'data-analyst': {
    topics: [
      topic('spreadsheets', 'Spreadsheets and cleaning', 'Prepare tables, spot messy values, and make a dataset ready to inspect.', 'Completed', 100, [], ['Spreadsheet cleaning checklist'], false, 0, 0),
      topic('sql', 'SQL foundations', 'Query, filter, join, and summarize relational data with confidence.', 'Completed', 100, ['spreadsheets'], ['SQL practice set'], false, 250, 0),
      topic('statistics', 'Descriptive statistics', 'Choose summaries that describe a dataset without hiding its shape.', 'In progress', 48, ['sql'], ['Statistics for Research course'], false, 500, -100),
      topic('visualization', 'Data visualization', 'Select visual encodings that help someone notice the important comparison.', 'Not started', 0, ['statistics'], ['Visualization patterns guide'], false, 750, -100),
      topic('storytelling', 'Data storytelling', 'Turn analysis into a clear recommendation with context and caveats.', 'Not started', 0, ['visualization'], ['Data storytelling studio'], false, 1000, -100),
      topic('python', 'Python for analysis', 'Use notebooks and data frames to repeat analysis beyond a spreadsheet.', 'Not started', 0, ['sql'], ['Python data lab'], true, 500, 140),
      topic('experiments', 'Experiment design', 'Frame a measurable question and distinguish signal from noisy results.', 'Not started', 0, ['statistics'], ['Experiment design primer'], true, 750, 140),
      topic('portfolio', 'Portfolio case study', 'Present one end-to-end analysis that makes your reasoning visible.', 'Not started', 0, ['storytelling', 'experiments'], ['Case study outline'], false, 1250, -100),
    ],
    edges: [
      { id: 'e-spreadsheets-sql', source: 'spreadsheets', target: 'sql' }, { id: 'e-sql-statistics', source: 'sql', target: 'statistics' }, { id: 'e-statistics-visualization', source: 'statistics', target: 'visualization' }, { id: 'e-visualization-storytelling', source: 'visualization', target: 'storytelling' }, { id: 'e-storytelling-portfolio', source: 'storytelling', target: 'portfolio' }, { id: 'e-sql-python', source: 'sql', target: 'python' }, { id: 'e-statistics-experiments', source: 'statistics', target: 'experiments' }, { id: 'e-experiments-portfolio', source: 'experiments', target: 'portfolio' },
    ],
  },
  'backend-developer': {
    topics: [
      topic('http-and-apis', 'HTTP and APIs', 'Understand requests, responses, resources, and predictable API boundaries.', 'Completed', 100, [], ['API design notes'], false, 0, 0),
      topic('sql-databases', 'SQL databases', 'Model relational data and write queries that preserve useful constraints.', 'Completed', 100, ['http-and-apis'], ['Database fundamentals'], false, 250, 0),
      topic('authentication', 'Authentication', 'Protect service boundaries with sessions, tokens, and clear authorization rules.', 'In progress', 35, ['http-and-apis'], ['Auth patterns'], false, 500, -110),
      topic('testing-services', 'Testing services', 'Test business behavior and failure paths without coupling to implementation details.', 'Not started', 0, ['sql-databases', 'authentication'], ['Backend testing lab'], false, 750, -110),
      topic('deployment', 'Deployment', 'Ship a service with configuration, observability, and a rollback path.', 'Not started', 0, ['testing-services'], ['Deployment checklist'], false, 1000, -110),
      topic('caching', 'Caching', 'Choose what to cache and reason about freshness and invalidation.', 'Not started', 0, ['sql-databases'], ['Caching patterns'], false, 500, 120),
      topic('capstone-api', 'Capstone API', 'Build and document a small production-shaped service.', 'Not started', 0, ['deployment', 'caching'], ['API capstone brief'], false, 1250, -110),
    ],
    edges: [
      { id: 'e-http-sql', source: 'http-and-apis', target: 'sql-databases' }, { id: 'e-http-auth', source: 'http-and-apis', target: 'authentication' }, { id: 'e-sql-testing', source: 'sql-databases', target: 'testing-services' }, { id: 'e-auth-testing', source: 'authentication', target: 'testing-services' }, { id: 'e-testing-deployment', source: 'testing-services', target: 'deployment' }, { id: 'e-sql-caching', source: 'sql-databases', target: 'caching' }, { id: 'e-deployment-capstone', source: 'deployment', target: 'capstone-api' }, { id: 'e-caching-capstone', source: 'caching', target: 'capstone-api' },
    ],
  },
}
