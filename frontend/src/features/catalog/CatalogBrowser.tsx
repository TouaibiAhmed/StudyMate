import { ArrowRight, Clock3, Loader2, Plus, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/feedback/EmptyState'
import { catalogService } from '../../services/api-client'
import type { CatalogCourse } from '../../services/contracts/catalog'
import { RecommendationStrip } from '../recommendations/RecommendationStrip'

const DOMAINS = ['Computer Science & IT', 'Engineering', 'Business', 'Health & Medicine', 'Humanities & Social Sciences']

/** Browse the platform catalog and add courses to the library (Courses page, "Discover" tab). */
export function CatalogBrowser({ highlightId }: { highlightId?: string | null }) {
  const navigate = useNavigate()
  const [items, setItems] = useState<CatalogCourse[]>()
  const [query, setQuery] = useState('')
  const [domain, setDomain] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const highlighted = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void catalogService.listCatalog({ query, domain })
        .then((list) => { if (active) { setItems(list); setError('') } })
        .catch(() => { if (active) setError('The catalog could not load. Try again in a moment.') })
    }, query ? 250 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query, domain])

  useEffect(() => { highlighted.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [items, highlightId])

  async function enroll(course: CatalogCourse) {
    setBusy(course.id); setError('')
    try {
      const { courseId } = await catalogService.enroll(course.id)
      navigate(`/courses/${courseId}`)
    } catch {
      setError('That course could not be added. Try again.')
      setBusy('')
    }
  }

  return <div className="catalog-browser">
    {!query && !domain && <RecommendationStrip kind="course" limit={3} />}
    <div className="section-heading"><div><span className="eyebrow">Platform catalog</span><h2>Browse courses</h2><p className="panel-intro">Add a course to your library with its concepts ready to study. Upload your own lecture notes to it later and sessions will use them.</p></div></div>
    <section className="course-toolbar" aria-label="Catalog filters"><label className="search-box course-search"><Search size={17} /><input placeholder="Search the catalog" aria-label="Search the catalog" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="subject-filters" role="group" aria-label="Filter by domain"><button className={!domain ? 'selected' : ''} onClick={() => setDomain('')}>All domains</button>{DOMAINS.map((d) => <button key={d} className={domain === d ? 'selected' : ''} onClick={() => setDomain(d)}>{d}</button>)}</div></section>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!items ? <div className="inline-empty" role="status"><Loader2 size={15} className="spin" /> Loading the catalog…</div>
      : !items.length ? <EmptyState title="No catalog course matches" text="Try another word or domain." />
        : <div className="catalog-grid">{items.map((course) => <article key={course.id} id={`catalog-${course.id}`} ref={course.id === highlightId ? (el) => { highlighted.current = el } : undefined} className={`catalog-card${course.id === highlightId ? ' highlighted' : ''}`}>
          <span className="eyebrow">{course.level} · {course.subject}</span>
          <h3>{course.title}</h3>
          <p>{course.description}</p>
          <ul className="catalog-concepts">{course.concepts.slice(0, 4).map((c) => <li key={c.name}>{c.name}</li>)}{course.conceptCount > 4 && <li>+{course.conceptCount - 4} more</li>}</ul>
          <div className="catalog-card-footer"><small><Clock3 size={12} /> about {course.hours} h · {course.conceptCount} concepts</small>
            {course.enrolledCourseId
              ? <Link className="text-link" to={`/courses/${course.enrolledCourseId}`}>Open course <ArrowRight size={14} /></Link>
              : <button className="button button-secondary" disabled={busy === course.id} onClick={() => void enroll(course)}>{busy === course.id ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Add to my courses</button>}
          </div>
        </article>)}</div>}
  </div>
}
