import type { ReactNode } from 'react'
export function StatCard({ icon, label, value, detail, color }: { icon: ReactNode; label: string; value: string; detail: string; color: string }) {
  return <article className="stat-card"><div className={`stat-icon ${color}`}>{icon}</div><div><span className="muted">{label}</span><strong className="stat-value">{value}</strong><small className="stat-detail">{detail}</small></div></article>
}
