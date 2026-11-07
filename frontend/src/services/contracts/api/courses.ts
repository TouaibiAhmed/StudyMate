import type { ApiId, ApiPage, ApiSourceReference, ApiStatus, IsoTimestamp } from './common'

export type CourseDto = {
  id: ApiId
  title: string
  subject: string
  level: string
  description?: string
  domain?: string | null
  domain_type?: string | null
  domainType?: string | null
  status?: ApiStatus
  created_at?: IsoTimestamp
  createdAt?: IsoTimestamp
  updated_at?: IsoTimestamp
  updatedAt?: IsoTimestamp
  progress?: number
  completedMaterials?: number
  completed_materials?: number
  materialCount?: number
  material_count?: number
  lastStudied?: string
  last_studied?: string
  concepts?: CourseConceptDto[]
  sessions?: CourseStudySessionDto[]
}

export type CourseConceptDto = {
  id: ApiId
  courseId?: ApiId
  course_id?: ApiId
  name?: string
  title?: string
  description?: string | null
  prerequisites?: string[]
  domainType?: string
  domain_type?: string
  progress?: number
  status?: string
  createdAt?: IsoTimestamp
  created_at?: IsoTimestamp
  updatedAt?: IsoTimestamp
  updated_at?: IsoTimestamp
}

export type CourseStudySessionDto = {
  id: ApiId
  courseId?: ApiId
  course_id?: ApiId
  title: string
  date?: string
  duration?: string
  score?: string | null
  createdAt?: IsoTimestamp
  created_at?: IsoTimestamp
}

export type CreateCourseRequestDto = {
  title: string
  subject: string
  level: string
  description?: string
  domain?: string
  domain_type?: string
  domainType?: string
}

export type CourseDocumentStatus = 'queued' | 'processing' | 'ready' | 'failed'
export type CourseDocumentOrigin = 'student_upload' | 'platform_material'

export type CourseDocumentDto = {
  id: ApiId
  courseId?: ApiId
  course_id?: ApiId
  fileName?: string
  file_name?: string
  filename?: string
  mimeType?: string
  mime_type?: string
  sizeBytes?: number
  size_bytes?: number
  origin?: CourseDocumentOrigin
  source?: string
  status: CourseDocumentStatus | string
  pageCount?: number | null
  page_count?: number | null
  error?: string | null
  warnings?: string[] | null
  createdAt?: IsoTimestamp
  created_at?: IsoTimestamp
  updatedAt?: IsoTimestamp
  updated_at?: IsoTimestamp
}

export type DocumentIngestionStatusDto = {
  id?: ApiId
  documentId?: ApiId
  document_id?: ApiId
  courseId?: ApiId
  course_id?: ApiId
  status: 'queued' | 'processing' | 'ready' | 'failed' | string
  progress?: number
  pageCount?: number | null
  page_count?: number | null
  warnings?: string[] | null
  error?: string | null
  updatedAt?: IsoTimestamp
  updated_at?: IsoTimestamp
}

export type CourseDocumentListDto = ApiPage<CourseDocumentDto>
export type CourseSourceDto = ApiSourceReference & { documentId: ApiId }
