import { ArrowRight, Loader2, Plus, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { catalogService } from '../../services/api-client'
import type { Recommendation, RecommendationKind } from '../../services/contracts/catalog'

type Props = {
  kind: RecommendationKind
  limit?: number
  title?: string
  /** Called after a catalog course was added to the library (the strip then refreshes). */
  onEnrolled?: (courseId: string) => void
}

/** "Recommended for you": platform catalog courses or curated roadmaps, each with its reason. */
export function RecommendationStrip({ kind, limit = 3, title = 'Recommended for you', onEnrolled }: Props) {
  const navigate = useNavigate()
  const [items, setItems] = useState<Recommendation[]>()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    void catalogService.getRecommendations(kind, limit).then(setItems).catch(() => setItems([]))
  }, [kind, limit])
  useEffect(() => { load() }, [load])

  async function dismiss(item: Recommendation) {
    setItems((current) => current?.filter((x) => x.itemId !== item.itemId))
    try { await catalogService.dismiss(kind, item.itemId); load() } catch { load() }
  }

  async function enroll(item: Recommendation) {
    setBusy(item.itemId); setError('')
    try {
      const { courseId } = await catalogService.enroll(item.itemId)
      if (onEnrolled) { onEnrolled(courseId); load(); setBusy('') } else navigate(`/courses/${courseId}`)
    } catch {
      setError('That course could not be added. Try again.')
      setBusy('')
    }
  }

  if (!items?.length) return null
  return <section className="recommendation-strip" aria-label={title}>
    <div className="section-heading"><div><span className="eyebrow"><Sparkles size={13} /> Picked from the {kind === 'course' ? 'course catalog' : 'roadmap library'}</span><h2>{title}</h2></div></div>
    <div className="recommendation-cards">
      {items.map((item) => <article className="recommendation-card" key={item.itemId}>
        <button className="recommendation-card-dismiss" onClick={() => void dismiss(item)} aria-label={`Not interested in ${item.title}`} title="Not interested"><X size={14} /></button>
        <span className="eyebrow">{item.subtitle}</span>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
        <p className="recommendation-reason"><Sparkles size={12} /> {item.reason}</p>
        {kind === 'course'
          ? <button className="button button-secondary" disabled={busy === item.itemId} onClick={() => void enroll(item)}>{busy === item.itemId ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Add to my courses</button>
          : <Link className="button button-secondary" to={item.href}>View roadmap <ArrowRight size={14} /></Link>}
      </article>)}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>
}
