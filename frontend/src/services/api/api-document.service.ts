import type { DocumentService, DocumentStatus, DocumentStatusDetails, StudyDocument } from '../contracts/documents'
import type { CourseDocumentDto, DocumentIngestionStatusDto } from '../contracts/api/courses'
import { apiClient } from '../http-client'

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB max size as defined in v1.1 doc (Section 21.4)
const POLL_INTERVAL_MS = 2000

function pageItems<T>(value: T[] | { items: T[] } | undefined): T[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if ('items' in value && Array.isArray(value.items)) return value.items
  return []
}

export function normalizeDocumentStatus(status?: string): DocumentStatus {
  if (!status) return 'Queued'
  const s = status.toLowerCase()
  if (s === 'ready' || s === 'completed' || s === 'indexed') return 'Ready'
  if (s === 'failed' || s === 'error') return 'Failed'
  if (s === 'processing' || s === 'extracting' || s === 'indexing') return 'Processing'
  return 'Queued'
}

function formatAddedAt(iso?: string): string {
  if (!iso) return 'Recently added'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Recently added'
  return `Added ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export function mapDocumentDtoToDocument(dto: CourseDocumentDto): StudyDocument {
  const fileName = dto.fileName || dto.file_name || dto.filename || 'Document.pdf'
  const sizeBytes = dto.sizeBytes || dto.size_bytes || 0
  const status = normalizeDocumentStatus(dto.status)
  const isPlatform = dto.origin === 'platform_material' || dto.source === 'platform-material'

  return {
    id: dto.id,
    courseId: dto.courseId || dto.course_id || '',
    fileName,
    sizeBytes,
    status,
    addedAt: formatAddedAt(dto.createdAt || dto.created_at),
    error: dto.error ?? undefined,
    warnings: dto.warnings ?? undefined,
    pageCount: dto.pageCount ?? dto.page_count ?? undefined,
    source: isPlatform ? 'platform-material' : 'student-uploaded',
  }
}

function validatePdfFile(file: File) {
  const name = file.name.toLowerCase()
  if (!name.endsWith('.pdf') && file.type !== 'application/pdf') {
    throw new Error(`"${file.name}" is not a PDF. Please select PDF course materials only.`)
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" exceeds the maximum upload limit of 25 MB.`)
  }
}

export const apiDocumentService: DocumentService = {
  async listDocuments(courseId: string): Promise<StudyDocument[]> {
    const response = await apiClient.get<CourseDocumentDto[] | { items: CourseDocumentDto[] }>(`/api/courses/${courseId}/documents`)
    return pageItems(response.data).map(mapDocumentDtoToDocument)
  },

  async uploadDocument(courseId: string, file: File): Promise<StudyDocument> {
    validatePdfFile(file)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('fileName', file.name)
    formData.append('sizeBytes', String(file.size))
    formData.append('courseId', courseId)

    const response = await apiClient.upload<CourseDocumentDto>(`/api/courses/${courseId}/documents`, formData)
    return mapDocumentDtoToDocument(response.data)
  },

  async queueDocument(courseId: string, fileOrName: File | string, sizeBytes = 0): Promise<StudyDocument> {
    if (fileOrName instanceof File) {
      return this.uploadDocument!(courseId, fileOrName)
    }

    const formData = new FormData()
    formData.append('fileName', fileOrName)
    formData.append('sizeBytes', String(sizeBytes))
    formData.append('courseId', courseId)

    const response = await apiClient.upload<CourseDocumentDto>(`/api/courses/${courseId}/documents`, formData)
    return mapDocumentDtoToDocument(response.data)
  },

  async getDocumentStatus(documentId: string): Promise<DocumentStatusDetails> {
    const response = await apiClient.get<DocumentIngestionStatusDto>(`/api/documents/${documentId}/status`)
    const data = response.data
    return {
      status: normalizeDocumentStatus(data.status),
      pageCount: data.pageCount ?? data.page_count ?? undefined,
      warnings: data.warnings ?? undefined,
      error: data.error ?? undefined,
      progress: data.progress,
    }
  },

  async pollDocumentStatus(documentId: string, onUpdate?: (doc: StudyDocument) => void, signal?: AbortSignal): Promise<StudyDocument> {
    while (!signal?.aborted) {
      try {
        const details = await this.getDocumentStatus!(documentId)

        if (onUpdate) {
          onUpdate({
            id: documentId,
            courseId: '',
            fileName: '',
            sizeBytes: 0,
            status: details.status,
            addedAt: '',
            error: details.error,
            warnings: details.warnings,
            pageCount: details.pageCount,
          })
        }

        if (details.status === 'Ready' || details.status === 'Failed') {
          return {
            id: documentId,
            courseId: '',
            fileName: '',
            sizeBytes: 0,
            status: details.status,
            addedAt: '',
            error: details.error,
            warnings: details.warnings,
            pageCount: details.pageCount,
          }
        }
      } catch {
        // If polling endpoint fails temporarily, keep retrying until abort
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    return {
      id: documentId,
      courseId: '',
      fileName: '',
      sizeBytes: 0,
      status: 'Processing',
      addedAt: '',
    }
  },

  async removeDocument(documentId: string): Promise<void> {
    await apiClient.delete(`/api/documents/${documentId}`)
  },

  async retryDocument(documentId: string): Promise<StudyDocument | undefined> {
    const response = await apiClient.post<CourseDocumentDto>(`/api/documents/${documentId}/retry`)
    return response.data ? mapDocumentDtoToDocument(response.data) : undefined
  },
}
