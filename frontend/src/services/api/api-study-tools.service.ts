import type {
  GenerateQuizRequestDto,
  GenerateSummaryRequestDto,
  PatchQuizRequestDto,
  PatchSummaryRequestDto,
  QuizDto,
  QuizListDto,
  QuizResultDto,
  StudyToolArtifactDto,
  StudyToolArtifactListDto,
  SummaryDto,
  SummaryListDto,
} from '../contracts/api/study-tools'
import type { ApiSourceReference } from '../contracts/api/common'
import type {
  Quiz,
  QuizAttemptResult,
  QuizQuestion,
  StudyToolArtifact,
  StudyToolKind,
  StudyToolSource,
  StudyToolsService,
  Summary,
} from '../contracts/study-tools'
import { ApiError, apiClient } from '../http-client'

// ---------------------------------------------------------------------------
// Polling — used when POST returns status: 'queued' or 'processing'
// Max ~3min total (24 × up to 10s each). Re-fetches via GET /{resource}/{id}.
// ---------------------------------------------------------------------------

async function pollUntilReady<T extends { status: string; error?: string | null }>(
  fetcher: () => Promise<T>,
  maxAttempts = 24,
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1500 + attempt * 500, 10_000)
      await new Promise<void>((resolve) => window.setTimeout(resolve, delay))
    }
    const result = await fetcher()
    if (result.status === 'ready') return result
    if (result.status === 'failed' || (result.status as string) === 'error') {
      throw new ApiError({
        code: 'server-error',
        status: 500,
        message: result.error ?? 'Generation failed on the server.',
      })
    }
  }
  throw new ApiError({
    code: 'timeout',
    status: 408,
    message: 'Generation timed out. The server is taking too long — try again later.',
  })
}

// ---------------------------------------------------------------------------
// DTO mapping helpers
// ---------------------------------------------------------------------------

function mapSourceRef(ref: ApiSourceReference): StudyToolSource {
  return {
    title: ref.title || 'Source',
    page: typeof ref.page === 'number' ? ref.page : undefined,
    excerpt: ref.excerpt ?? undefined,
  }
}

function buildSourceLabel(sources: StudyToolSource[], topicCount: number): string {
  if (sources.length) {
    const names = sources.slice(0, 2).map((s) => s.title)
    return names.join(', ') + (sources.length > 2 ? ` +${sources.length - 2} more` : '')
  }
  return topicCount > 0
    ? `${topicCount} topic${topicCount === 1 ? '' : 's'}`
    : 'All course material'
}

function mapSummaryDto(dto: SummaryDto): Summary {
  const sources = (dto.sources ?? []).map(mapSourceRef)
  return {
    id: dto.id,
    courseId: dto.courseId,
    title: dto.title,
    createdAt: dto.createdAt,
    sourceDocumentIds: dto.sourceDocumentIds ?? [],
    topicIds: dto.topicIds ?? [],
    sourceLabel: buildSourceLabel(sources, dto.topicIds?.length ?? 0),
    length: dto.length,
    language: dto.language,
    structure: dto.structure,
    sections: dto.sections ?? [],
    sources,
  }
}

function mapQuizDto(dto: QuizDto): Quiz {
  const sources = (dto.sources ?? []).map(mapSourceRef)

  // Answer keys are intentionally absent from QuizQuestionDto to prevent
  // client-side grading of official attempts. Answers surface only via
  // submitQuizAttempt() → QuizResultDto.
  const questions: QuizQuestion[] = (dto.questions ?? []).map((q) => ({
    id: q.id,
    prompt: q.prompt,
    type: q.type,
    options: q.options ?? undefined,
    answer: { value: '' },
    topicId: q.topicId ?? undefined,
  }))

  return {
    id: dto.id,
    courseId: dto.courseId,
    title: dto.title,
    createdAt: dto.createdAt,
    sourceDocumentIds: dto.sourceDocumentIds ?? [],
    topicIds: dto.topicIds ?? [],
    sourceLabel: buildSourceLabel(sources, dto.topicIds?.length ?? 0),
    questionCount: dto.questionCount,
    difficulty: dto.difficulty,
    questionTypes: dto.questionTypes,
    language: dto.language,
    questions,
    sources,
  }
}

function mapArtifactDto(dto: StudyToolArtifactDto): StudyToolArtifact {
  return {
    id: dto.id,
    courseId: dto.courseId,
    kind: dto.kind as StudyToolKind,
    title: dto.title,
    createdAt: dto.createdAt,
    sourceDocumentIds: dto.sourceDocumentIds ?? [],
    description: dto.description ?? '',
  }
}

function extractSummaryList(data: SummaryListDto): SummaryDto[] {
  if (Array.isArray(data)) return data
  if ('items' in data) return data.items
  if ('summaries' in data) return data.summaries
  return []
}

function extractQuizList(data: QuizListDto): QuizDto[] {
  if (Array.isArray(data)) return data
  if ('items' in data) return data.items
  if ('quizzes' in data) return data.quizzes
  return []
}

function extractArtifactList(data: StudyToolArtifactListDto): StudyToolArtifactDto[] {
  if (Array.isArray(data)) return data
  if ('items' in data) return data.items
  if ('artifacts' in data) return data.artifacts
  return []
}

function mapQuizResult(dto: QuizResultDto): QuizAttemptResult {
  return {
    attemptId: dto.attemptId,
    score: dto.score ?? 0,
    correctCount: dto.correctCount,
    incorrectCount: dto.incorrectCount,
    unansweredCount: dto.unansweredCount,
    answers: (dto.answers ?? []).map((a) => ({
      questionId: a.questionId,
      givenAnswer: a.answer ?? '',
      correctAnswer: a.correctAnswer ?? '',
      explanation: a.explanation ?? undefined,
      isCorrect: a.isCorrect,
    })),
  }
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

export const apiStudyToolsService: StudyToolsService = {
  // -------------------------------------------------------------------------
  // Artifacts (undocumented endpoint — falls back to aggregating
  // summaries + quizzes when GET /courses/{id}/study-tools returns 404)
  // -------------------------------------------------------------------------

  async listArtifacts(courseId: string): Promise<StudyToolArtifact[]> {
    try {
      const response = await apiClient.get<StudyToolArtifactListDto>(`/api/courses/${courseId}/study-tools`)
      return extractArtifactList(response.data).map(mapArtifactDto)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'not-found') {
        // Endpoint not yet deployed — build an aggregate list from summaries + quizzes
        const [summaries, quizzes] = await Promise.all([
          apiClient.get<SummaryListDto>(`/api/courses/${courseId}/summaries`).then((r) => extractSummaryList(r.data)),
          apiClient.get<QuizListDto>(`/api/courses/${courseId}/quizzes`).then((r) => extractQuizList(r.data)),
        ])
        const summaryArtifacts: StudyToolArtifact[] = summaries.map((s) => ({
          id: s.id,
          courseId: s.courseId,
          kind: 'summary' as StudyToolKind,
          title: s.title,
          createdAt: s.createdAt,
          sourceDocumentIds: s.sourceDocumentIds ?? [],
          description: `${s.length} · ${s.language} · ${s.structure}`,
        }))
        const quizArtifacts: StudyToolArtifact[] = quizzes.map((q) => ({
          id: q.id,
          courseId: q.courseId,
          kind: 'quiz' as StudyToolKind,
          title: q.title,
          createdAt: q.createdAt,
          sourceDocumentIds: q.sourceDocumentIds ?? [],
          description: `${q.questionCount} questions · ${q.difficulty} · ${q.language}`,
        }))
        return [...summaryArtifacts, ...quizArtifacts].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        )
      }
      throw error
    }
  },

  async createArtifact(courseId: string, kind: StudyToolKind, sourceDocumentIds: string[]): Promise<StudyToolArtifact> {
    // Undocumented endpoint — delegate to the appropriate generation endpoint
    // using default options, then convert the result to a StudyToolArtifact.
    if (kind === 'summary') {
      const summary = await this.generateSummary(courseId, {
        sourceDocumentIds,
        topicIds: [],
        length: 'Medium',
        language: 'English',
        structure: 'Key Concepts',
      })
      return {
        id: summary.id,
        courseId: summary.courseId,
        kind: 'summary',
        title: summary.title,
        createdAt: summary.createdAt,
        sourceDocumentIds: summary.sourceDocumentIds,
        description: `${summary.length} · ${summary.language} · ${summary.structure}`,
      }
    } else {
      const quiz = await this.generateQuiz(courseId, {
        sourceDocumentIds,
        topicIds: [],
        questionCount: 10,
        difficulty: 'Mixed',
        questionTypes: ['Multiple Choice', 'True/False'],
        language: 'English',
      })
      return {
        id: quiz.id,
        courseId: quiz.courseId,
        kind: 'quiz',
        title: quiz.title,
        createdAt: quiz.createdAt,
        sourceDocumentIds: quiz.sourceDocumentIds,
        description: `${quiz.questionCount} questions · ${quiz.difficulty} · ${quiz.language}`,
      }
    }
  },

  // -------------------------------------------------------------------------
  // Summaries
  // -------------------------------------------------------------------------

  async listSummaries(courseId: string): Promise<Summary[]> {
    const response = await apiClient.get<SummaryListDto>(`/api/courses/${courseId}/summaries`)
    return extractSummaryList(response.data).map(mapSummaryDto)
  },

  async generateSummary(
    courseId: string,
    options: Pick<Summary, 'sourceDocumentIds' | 'topicIds' | 'length' | 'language' | 'structure'>,
  ): Promise<Summary> {
    const body: GenerateSummaryRequestDto = {
      sourceDocumentIds: options.sourceDocumentIds,
      topicIds: options.topicIds,
      length: options.length,
      language: options.language,
      structure: options.structure,
    }
    const createResponse = await apiClient.post<SummaryDto>(`/api/courses/${courseId}/summaries`, body)
    const created = createResponse.data

    if (created.status === 'ready') return mapSummaryDto(created)

    // Async generation — poll GET /api/summaries/{id} until status is ready
    const ready = await pollUntilReady(async () => {
      const r = await apiClient.get<SummaryDto>(`/api/summaries/${created.id}`)
      return r.data
    })
    return mapSummaryDto(ready)
  },

  async updateSummary(summaryId: string, updates: { title?: string }): Promise<Summary | undefined> {
    // PATCH /api/summaries/{id} is not in the proposed endpoint list.
    // Assumed to exist; a 404 means the endpoint is not yet deployed.
    const body: PatchSummaryRequestDto = { title: updates.title ?? null }
    const response = await apiClient.patch<SummaryDto>(`/api/summaries/${summaryId}`, body)
    return mapSummaryDto(response.data)
  },

  async deleteSummary(summaryId: string): Promise<void> {
    await apiClient.delete(`/api/summaries/${summaryId}`)
  },

  // -------------------------------------------------------------------------
  // Quizzes
  // -------------------------------------------------------------------------

  async listQuizzes(courseId: string): Promise<Quiz[]> {
    const response = await apiClient.get<QuizListDto>(`/api/courses/${courseId}/quizzes`)
    return extractQuizList(response.data).map(mapQuizDto)
  },

  async generateQuiz(
    courseId: string,
    options: Pick<Quiz, 'sourceDocumentIds' | 'topicIds' | 'questionCount' | 'difficulty' | 'questionTypes' | 'language'>,
  ): Promise<Quiz> {
    const body: GenerateQuizRequestDto = {
      sourceDocumentIds: options.sourceDocumentIds,
      topicIds: options.topicIds,
      questionCount: options.questionCount,
      difficulty: options.difficulty,
      questionTypes: options.questionTypes,
      language: options.language,
    }
    const createResponse = await apiClient.post<QuizDto>(`/api/courses/${courseId}/quizzes`, body)
    const created = createResponse.data

    if (created.status === 'ready') return mapQuizDto(created)

    // Async generation — poll GET /api/quizzes/{id} until status is ready
    const ready = await pollUntilReady(async () => {
      const r = await apiClient.get<QuizDto>(`/api/quizzes/${created.id}`)
      return r.data
    })
    return mapQuizDto(ready)
  },

  async updateQuiz(quizId: string, updates: { title?: string }): Promise<Quiz | undefined> {
    // PATCH /api/quizzes/{id} is not in the proposed endpoint list.
    // Assumed to exist; a 404 means the endpoint is not yet deployed.
    const body: PatchQuizRequestDto = { title: updates.title ?? null }
    const response = await apiClient.patch<QuizDto>(`/api/quizzes/${quizId}`, body)
    return mapQuizDto(response.data)
  },

  async deleteQuiz(quizId: string): Promise<void> {
    await apiClient.delete(`/api/quizzes/${quizId}`)
  },

  // -------------------------------------------------------------------------
  // Quiz attempts — only present in api mode; mock service does not define these
  // -------------------------------------------------------------------------

  async startQuizAttempt(quizId: string): Promise<{ attemptId: string }> {
    const response = await apiClient.post<{ id: string }>(`/api/quizzes/${quizId}/attempts`)
    return { attemptId: response.data.id }
  },

  async submitQuizAttempt(attemptId: string, answers: Record<string, string>): Promise<QuizAttemptResult> {
    // POST /api/quiz-attempts/{id}/submit
    // answers: Record<questionId, givenAnswer> — grading happens on the server
    const body = { answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })) }
    const response = await apiClient.post<QuizResultDto>(`/api/quiz-attempts/${attemptId}/submit`, body)
    return mapQuizResult(response.data)
  },
}
