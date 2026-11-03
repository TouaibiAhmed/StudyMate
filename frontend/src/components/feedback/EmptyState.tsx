import { Sparkles } from 'lucide-react'
export function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><Sparkles size={22} /><strong>{title}</strong><p>{text}</p></div>
}
