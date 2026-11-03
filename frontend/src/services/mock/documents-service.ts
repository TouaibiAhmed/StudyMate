import type { DocumentService, StudyDocument } from '../contracts/documents'

let nextDocumentNumber = 1
const mockDocuments: StudyDocument[] = [
  { id: 'document-deep-1', courseId: 'deep-learning', fileName: 'deep-learning-notes.pdf', sizeBytes: 2400000, status: 'Ready', addedAt: 'Added today' },
  { id: 'document-deep-2', courseId: 'deep-learning', fileName: 'lecture-04-regularization.pdf', sizeBytes: 5800000, status: 'Processing', addedAt: 'Added yesterday' },
  { id: 'document-deep-3', courseId: 'deep-learning', fileName: 'neural-networks-reading.pdf', sizeBytes: 1200000, status: 'Failed', addedAt: 'Added 10 November', error: 'This mock document needs to be retried.' },
]

export const mockDocumentService: DocumentService = {
  async listDocuments(courseId) {
    return mockDocuments.filter((document) => document.courseId === courseId).map((document) => ({ ...document }))
  },
  async queueDocument(courseId, fileName, sizeBytes) {
    const document: StudyDocument = { id: `document-${nextDocumentNumber++}`, courseId, fileName, sizeBytes, status: 'Queued', addedAt: 'Added just now' }
    mockDocuments.unshift(document)
    return { ...document }
  },
  async removeDocument(documentId) {
    const index = mockDocuments.findIndex((document) => document.id === documentId)
    if (index >= 0) mockDocuments.splice(index, 1)
  },
  async retryDocument(documentId) {
    const document = mockDocuments.find((item) => item.id === documentId)
    if (!document) return undefined
    document.status = 'Ready'
    document.error = undefined
    document.addedAt = 'Retry completed just now'
    return { ...document }
  },
}
