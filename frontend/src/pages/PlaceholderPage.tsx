import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'

type Props = {
  eyebrow: string
  title: string
  description: string
}

export function PlaceholderPage({ eyebrow, title, description }: Props) {
  return (
    <div className="page-stack placeholder-page">
      <section className="placeholder-card">
        <div className="placeholder-icon"><BookOpen size={22} /></div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="placeholder-status"><CheckCircle2 size={16} /> This workspace is ready for content.</div>
        <Link className="button" to="/"><ArrowLeft size={16} /> Back to home</Link>
      </section>
      <Link className="text-link" to="/courses">Explore your courses <ArrowRight size={15} /></Link>
    </div>
  )
}
