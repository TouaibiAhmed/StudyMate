import { AlertCircle, CheckCircle2, FileText, LoaderCircle, Trash2, UploadCloud } from 'lucide-react'
import type { ChangeEvent, DragEvent } from 'react'
import type { StudyDocument } from '../../services/contracts/documents'

type Props = {
  documents: StudyDocument[]
  error: string
  onFilesSelected: (files: FileList | File[]) => void
  onRemove: (documentId: string) => void
  onRetry: (documentId: string) => void
}

export function DocumentUpload({ documents, error, onFilesSelected, onRemove, onRetry }: Props) {
  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    onFilesSelected(event.dataTransfer.files)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) onFilesSelected(event.target.files)
    event.target.value = ''
  }

  return (
    <div className="document-area">
      <label className="document-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        <input type="file" accept=".pdf,application/pdf" multiple onChange={handleChange} />
        <span className="upload-icon"><UploadCloud size={21} /></span>
        <strong>Drop study PDFs here</strong>
        <span>or <u>choose files</u> from your device</span>
        <small>PDF only · Files stay in this browser</small>
      </label>
      {error && <p className="upload-error" role="alert"><AlertCircle size={15} />{error}</p>}
      {documents.length > 0 && <div className="document-list">{documents.map((document) => <DocumentRow document={document} key={document.id} onRemove={onRemove} onRetry={onRetry} />)}</div>}
      {documents.length === 0 && <p className="documents-empty">No course documents yet. Add a lecture note or reading to keep everything together.</p>}
    </div>
  )
}

function DocumentRow({ document, onRemove, onRetry }: { document: StudyDocument; onRemove: (id: string) => void; onRetry: (id: string) => void }) {
  const statusIcon = document.status === 'Ready' ? <CheckCircle2 size={16} /> : document.status === 'Failed' ? <AlertCircle size={16} /> : <LoaderCircle className={document.status === 'Processing' ? 'spin' : ''} size={16} />
  return <div className="document-row"><div className="document-file-icon"><FileText size={18} /></div><div className="document-copy"><strong>{document.fileName}</strong><span>{formatBytes(document.sizeBytes)} · {document.addedAt}</span>{document.error && <small>{document.error}</small>}</div><span className={`document-status ${document.status.toLowerCase()}`}>{statusIcon}{document.status}</span>{document.status === 'Failed' && <button className="document-retry" onClick={() => onRetry(document.id)}>Retry</button>}<button className="document-remove" onClick={() => onRemove(document.id)} aria-label={`Remove ${document.fileName}`}><Trash2 size={15} /></button></div>
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
