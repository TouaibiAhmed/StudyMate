import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><Sparkles size={22} /><strong>{title}</strong><p>{text}</p>{action}</div>
}
