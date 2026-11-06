import { X } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import type { CourseLevel, CourseSubject, CreateCourseInput } from '../../services/contracts/courses'
import { Button } from '../../components/ui/Button'

type Props = {
  open: boolean
  onClose: () => void
  onSubmit: (input: CreateCourseInput) => void
}

const subjects: CourseSubject[] = ['Deep Learning', 'Statistics', 'Biology', 'Business Fundamentals']
const levels: CourseLevel[] = ['Beginner', 'Intermediate', 'Advanced']

export function CourseCreationDialog({ open, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState<CourseSubject>('Deep Learning')
  const [level, setLevel] = useState<CourseLevel>('Beginner')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])

  if (!open) return null

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (title.trim().length < 3) {
      setError('Give your course a title with at least 3 characters.')
      return
    }
    onSubmit({ title, subject, level, description })
    setTitle('')
    setDescription('')
    setError('')
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dialog course-dialog" role="dialog" aria-modal="true" aria-labelledby="create-course-title">
        <div className="dialog-heading"><div><span className="eyebrow">Build your own study path</span><h2 id="create-course-title">Create a course</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>
        <form className="course-form" onSubmit={submit}>
          <label>Course title<input autoFocus value={title} onChange={(event) => { setTitle(event.target.value); setError('') }} placeholder="e.g. Experimental design" /></label>
          <div className="form-grid"><label>Field of study<select value={subject} onChange={(event) => setSubject(event.target.value as CourseSubject)}>{subjects.map((option) => <option key={option}>{option}</option>)}</select></label><label>Level<select value={level} onChange={(event) => setLevel(event.target.value as CourseLevel)}>{levels.map((option) => <option key={option}>{option}</option>)}</select></label></div>
          <label>Optional description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What would you like to understand?" rows={3} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">Create course</Button></div>
        </form>
      </section>
    </div>
  )
}
