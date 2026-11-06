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
}

export interface DocumentService {
  listDocuments(courseId: string): Promise<StudyDocument[]>
  queueDocument(courseId: string, fileName: string, sizeBytes: number): Promise<StudyDocument>
  removeDocument(documentId: string): Promise<void>
  retryDocument(documentId: string): Promise<StudyDocument | undefined>
}
