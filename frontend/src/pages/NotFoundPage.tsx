import { ArrowLeft, Home } from 'lucide-react'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return <div className="page-stack placeholder-page"><section className="placeholder-card"><div className="placeholder-icon"><Home size={22} /></div><span className="eyebrow">Page not found</span><h2>That study space is not here</h2><p>We could not find this route. Return home or use the main navigation to continue.</p><div className="dialog-actions"><Link className="button button-secondary" to="/"><ArrowLeft size={15} /> Go home</Link><Link className="button" to="/courses">Browse courses</Link></div></section></div>
}
