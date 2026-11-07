export type DocumentStatus = 'Queued' | 'Processing' | 'Ready' | 'Failed'
export type DocumentSource = 'student-uploaded' | 'platform-material'

export type StudyDocument = {
  id: string
  courseId: string
  fileName: string
  sizeBytes: number
  status: DocumentStatus
  addedAt: string
  error?: string
  source?: DocumentSource
  pageCount?: number
  warnings?: string[]
}

export type DocumentStatusDetails = {
  status: DocumentStatus
  pageCount?: number
  warnings?: string[]
  error?: string
  progress?: number
}

export interface DocumentService {
  listDocuments(courseId: string): Promise<StudyDocument[]>
  queueDocument(courseId: string, fileName: string, sizeBytes: number): Promise<StudyDocument>
  uploadDocument?(courseId: string, file: File): Promise<StudyDocument>
  getDocumentStatus?(documentId: string): Promise<DocumentStatusDetails>
  pollDocumentStatus?(documentId: string, onUpdate?: (doc: StudyDocument) => void, signal?: AbortSignal): Promise<StudyDocument>
  removeDocument(documentId: string): Promise<void>
  retryDocument(documentId: string): Promise<StudyDocument | undefined>
}
