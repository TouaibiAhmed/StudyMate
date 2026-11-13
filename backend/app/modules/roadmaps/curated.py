"""Curated roadmaps shipped with the platform.

Written for Study Partner. Each node names what to learn and why, plus the KIND of resource to
look for (no links: links rot and an invented link is worse than none).

Edit freely; bump VERSION of a roadmap after changing it. Seeding is idempotent: nodes are matched by
their key, so a student's progress survives content updates. Removing a key removes that node.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class CuratedNode:
    key: str
    title: str
    description: str
    prerequisites: tuple[str, ...] = ()
    optional: bool = False
    resources: tuple[str, ...] = ()


@dataclass(frozen=True)
class CuratedRoadmap:
    slug: str
    version: int
    role: str
    category: str  # data | engineering | machine_learning | business
    description: str
    note: str
    nodes: tuple[CuratedNode, ...] = field(default_factory=tuple)


N = CuratedNode

BACKEND = CuratedRoadmap(
    slug="backend-developer", version=1, role="Backend Developer", category="engineering",
    description="Build the services, APIs and data layers behind real products, and keep them reliable.",
    note="A map of ideas to practise, not a checklist every backend job requires. Pick one language and go deep "
         "before adding more.",
    nodes=(
        N("programming", "Programming fundamentals in one language",
          "Variables, control flow, functions, data structures and error handling in one backend language "
          "(for example Python, Java, Go or C#). Write small programs until the syntax stops being the problem.",
          resources=("The official tutorial of the language you chose",
                     "A beginner exercise platform with automated tests")),
        N("git", "Version control with Git",
          "Commits, branches, merges and pull requests. Every team expects you to work this way.",
          ("programming",), resources=("The Pro Git book", "An interactive Git branching exercise")),
        N("http", "How the web works: HTTP",
          "Requests and responses, methods, status codes, headers, cookies and what happens between a browser and "
          "a server.", ("programming",), resources=("MDN guide to HTTP",)),
        N("sql", "Relational databases and SQL",
          "Tables, keys, joins, aggregation, indexes and transactions. Most product data lives here.",
          ("programming",), resources=("Documentation of PostgreSQL or another open-source database",
                                       "A SQL practice site with graded exercises")),
        N("apis", "Designing REST APIs",
          "Resources, validation, pagination, error formats and versioning. Build a small API with a framework of "
          "your language.", ("http", "sql"), resources=("The documentation of a web framework for your language",)),
        N("auth", "Authentication and authorization",
          "Password hashing, sessions vs. tokens, roles and permissions, and the most common security mistakes.",
          ("apis",), resources=("The OWASP cheat sheets on authentication and session management",)),
        N("testing", "Testing services",
          "Unit tests, integration tests against a real database, and testing an API end to end.",
          ("apis",), resources=("The testing guide of your framework",)),
        N("caching", "Caching and performance",
          "Measure first, then cache: in-memory caches, HTTP caching, and query optimisation with indexes.",
          ("apis",), optional=True, resources=("Your database's guide to reading query plans",)),
        N("async", "Background jobs and messaging",
          "Moving slow work out of requests with queues and workers; retries and idempotency.",
          ("apis",), optional=True, resources=("Documentation of a job queue or message broker",)),
        N("containers", "Containers and deployment",
          "Package the service in a container, configure it with environment variables and deploy it.",
          ("git", "apis"), resources=("The Docker getting-started guide",)),
        N("observability", "Logging and monitoring",
          "Structured logs, metrics and alerts so you know what the service does in production.",
          ("containers",), optional=True, resources=("Introductory material on the three pillars of observability",)),
        N("capstone", "Capstone: a complete service",
          "Build, test and deploy an API with authentication, a database and background work. Write down the "
          "design decisions you made.", ("auth", "testing", "containers")),
    ),
)

FRONTEND = CuratedRoadmap(
    slug="frontend-developer", version=1, role="Frontend Developer", category="engineering",
    description="Build accessible, fast interfaces that people enjoy using in the browser.",
    note="Fundamentals (HTML, CSS, JavaScript) outlast every framework. Build small projects at each step.",
    nodes=(
        N("html", "Semantic HTML",
          "Structure pages with the right elements: headings, lists, forms, landmarks. It is the base of "
          "accessibility.", resources=("MDN HTML learning area",)),
        N("css", "CSS layout and styling",
          "The box model, flexbox, grid, responsive design and a simple design system of colours and spacing.",
          ("html",), resources=("MDN CSS learning area",)),
        N("javascript", "JavaScript fundamentals",
          "Types, functions, objects, arrays, closures, modules and asynchronous code with promises.",
          ("html",), resources=("A modern JavaScript tutorial", "MDN JavaScript guide")),
        N("dom", "The DOM and browser APIs",
          "Selecting and updating elements, events, fetch, and storage in the browser.",
          ("javascript", "css")),
        N("git", "Version control with Git",
          "Commits, branches and pull requests for working with a team.", resources=("The Pro Git book",)),
        N("typescript", "TypeScript",
          "Static types for JavaScript: catch mistakes before running the code and document intent.",
          ("javascript",), resources=("The TypeScript handbook",)),
        N("framework", "A component framework",
          "Components, props, state and effects in one framework such as React, Vue or Svelte.",
          ("dom", "typescript"), resources=("The official tutorial of the framework you chose",)),
        N("accessibility", "Accessibility",
          "Keyboard use, focus, labels, colour contrast and testing with a screen reader.",
          ("html", "css"), resources=("The WAI tutorials from W3C",)),
        N("data-fetching", "Working with APIs",
          "Loading, error and empty states; caching server data; forms and validation.",
          ("framework",)),
        N("testing", "Frontend testing",
          "Component tests that behave like a user, and a few end-to-end tests of key journeys.",
          ("framework",), resources=("Documentation of a component testing library",)),
        N("performance", "Web performance",
          "Measure loading and interaction, then reduce bundle size, images and layout shifts.",
          ("framework",), optional=True, resources=("Guides about Core Web Vitals",)),
        N("capstone", "Capstone: a complete web app",
          "Ship an accessible app that talks to a real API, with tests and a deployment.",
          ("data-fetching", "testing", "accessibility", "git")),
    ),
)

DATA_ANALYST = CuratedRoadmap(
    slug="data-analyst", version=1, role="Data Analyst", category="data",
    description="Turn questions and messy datasets into clear, decision-ready answers.",
    note="Tools differ between industries; the thinking does not. Practise on public datasets that interest you.",
    nodes=(
        N("spreadsheets", "Spreadsheets",
          "Formulas, lookups, pivot tables and cleaning data in a spreadsheet tool.",
          resources=("The help centre of your spreadsheet tool",)),
        N("statistics", "Descriptive statistics",
          "Averages, spread, distributions, percentiles and why outliers matter.",
          ("spreadsheets",), resources=("An introductory statistics course",)),
        N("sql", "SQL for analysis",
          "Filtering, joins, grouping, window functions and common table expressions.",
          ("spreadsheets",), resources=("A SQL practice site with graded exercises",)),
        N("cleaning", "Data cleaning",
          "Missing values, duplicates, inconsistent formats and documenting every change you make.",
          ("sql",)),
        N("visualization", "Data visualization",
          "Choosing the right chart, labelling it honestly and removing clutter.",
          ("statistics",), resources=("A book on visualising data for decision makers",)),
        N("bi-tool", "A business intelligence tool",
          "Build dashboards in a tool such as Power BI, Tableau or Looker Studio.",
          ("visualization", "sql")),
        N("inference", "Inferential statistics",
          "Sampling, confidence intervals and hypothesis tests, and what they cannot tell you.",
          ("statistics",)),
        N("python", "Python for data analysis",
          "Notebooks, pandas data frames and plotting for analyses a spreadsheet cannot handle.",
          ("cleaning",), optional=True, resources=("The pandas getting-started tutorials",)),
        N("experiments", "Experiment design and A/B tests",
          "Designing a fair test, choosing a metric and reading the result.",
          ("inference",), optional=True),
        N("storytelling", "Communicating findings",
          "Start from the decision, show the evidence, state the uncertainty, recommend an action.",
          ("visualization",)),
        N("capstone", "Capstone: an end-to-end analysis",
          "Pick a real question, clean the data, analyse it and present a short report with a dashboard.",
          ("bi-tool", "storytelling", "inference")),
    ),
)

ML_ENGINEER = CuratedRoadmap(
    slug="machine-learning-engineer", version=1, role="Machine Learning Engineer", category="machine_learning",
    description="Connect modelling fundamentals with data, evaluation and running models in production.",
    note="Production skills matter as much as training models. Keep one project running alongside the theory.",
    nodes=(
        N("python", "Python for machine learning",
          "Python, NumPy and pandas fluency: vectorised operations, data frames and notebooks.",
          resources=("The official Python tutorial", "The NumPy and pandas user guides")),
        N("math", "Math foundations",
          "Linear algebra (vectors, matrices), calculus (derivatives, gradients) and probability.",
          resources=("An introductory linear algebra course",)),
        N("data-prep", "Data preparation",
          "Splitting data, handling missing values, encoding categories and avoiding leakage.",
          ("python",)),
        N("supervised", "Supervised learning",
          "Linear and logistic regression, trees and ensembles; the bias-variance trade-off.",
          ("data-prep", "math"), resources=("The scikit-learn user guide",)),
        N("evaluation", "Model evaluation",
          "Cross-validation, choosing metrics for the problem, and reading a confusion matrix.",
          ("supervised",)),
        N("unsupervised", "Unsupervised learning",
          "Clustering and dimensionality reduction, and when they help.",
          ("supervised",), optional=True),
        N("features", "Feature engineering",
          "Turning raw data into informative inputs, and checking that they help.",
          ("evaluation",)),
        N("deep-learning", "Neural networks and deep learning",
          "Layers, activation functions, backpropagation and training with a framework such as PyTorch.",
          ("supervised", "math"), resources=("The tutorials of PyTorch or TensorFlow",)),
        N("serving", "Serving models",
          "Packaging a model behind an API, batch vs. online prediction, and latency.",
          ("evaluation",)),
        N("mlops", "MLOps foundations",
          "Experiment tracking, reproducible pipelines, model versioning and CI for ML code.",
          ("serving",)),
        N("monitoring", "Monitoring models in production",
          "Data drift, performance decay and deciding when to retrain.",
          ("mlops",)),
        N("research", "Reading research papers",
          "How to read a paper, reproduce a result and judge whether it applies to your problem.",
          ("deep-learning",), optional=True),
        N("capstone", "Capstone: a model in production",
          "Train, evaluate, deploy and monitor a model on a real dataset; document its limits.",
          ("features", "monitoring")),
    ),
)

ACCOUNTANT = CuratedRoadmap(
    slug="accountant", version=1, role="Accountant", category="business",
    description="Record, report and analyse financial information that organisations rely on.",
    note="Rules depend on the country and its standards (for example IFRS or local GAAP). Check what applies "
         "where you want to work.",
    nodes=(
        N("principles", "Accounting principles",
          "The accounting equation, accrual basis and the concepts behind financial records."),
        N("bookkeeping", "Double-entry bookkeeping",
          "Journals, ledgers, debits and credits, and the trial balance.",
          ("principles",)),
        N("statements", "Financial statements",
          "Balance sheet, income statement and cash-flow statement, and how they connect.",
          ("bookkeeping",)),
        N("spreadsheets", "Spreadsheets for accounting",
          "Reconciliations, lookups and pivot tables for financial data.",
          ("bookkeeping",)),
        N("standards", "Accounting standards",
          "Revenue recognition, inventories, fixed assets and depreciation under the standards that apply to you.",
          ("statements",), resources=("The official summaries of the standards used in your country",)),
        N("tax", "Taxation basics",
          "Corporate and indirect taxes and how they appear in the accounts.",
          ("statements",), resources=("Your tax authority's guides for businesses",)),
        N("management", "Management accounting",
          "Costing, budgets and variance analysis for decisions inside the organisation.",
          ("statements",)),
        N("analysis", "Financial analysis",
          "Ratios, trends and cash flow: what the statements say about a business.",
          ("statements", "spreadsheets")),
        N("audit", "Internal control and audit",
          "Controls that prevent errors and fraud, and how auditors test them.",
          ("standards",), optional=True),
        N("software", "Accounting software",
          "Working in an accounting system or ERP: charts of accounts, closing and reports.",
          ("bookkeeping",), optional=True),
        N("ethics", "Professional ethics",
          "Integrity, objectivity and confidentiality in the profession's code of ethics.",
          ("principles",)),
        N("capstone", "Capstone: a full accounting cycle",
          "Run a month for a small fictional business: record transactions, close, report and analyse.",
          ("standards", "tax", "analysis", "ethics")),
    ),
)

CURATED: tuple[CuratedRoadmap, ...] = (BACKEND, FRONTEND, DATA_ANALYST, ML_ENGINEER, ACCOUNTANT)
