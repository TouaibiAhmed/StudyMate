import { Sparkles } from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'
import { getDataMode } from '../../../services/service-mode'

const isMockAuth = getDataMode('auth') === 'mock'

export function AuthLayout({ children, eyebrow, title, text, wide = false }: PropsWithChildren<{ eyebrow: string; title: string; text: string; wide?: boolean }>) {
  return <main className="auth-page"><section className="auth-aside"><Link to="/" className="brand auth-brand"><span className="brand-mark"><Sparkles size={17} /></span><span>Study<span className="brand-accent">mate</span></span></Link><div><span className="eyebrow">The Learning Studio</span><h1>Make your next study hour count.</h1><p>A calm place to build understanding, one thoughtful question at a time.</p></div>{isMockAuth && <span className="auth-aside-note">Mock frontend experience · No real account or backend required</span>}</section><section className="auth-content"><div className={`auth-form-wrap${wide ? ' auth-form-wrap-wide' : ''}`}><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p className="auth-intro">{text}</p>{children}</div></section></main>
}
