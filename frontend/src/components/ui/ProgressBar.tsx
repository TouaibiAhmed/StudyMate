export function ProgressBar({ value, color = 'purple' }: { value: number; color?: 'purple' | 'green' | 'orange' }) {
  return <div className="progress-track"><span className={`progress-fill ${color}`} style={{ width: `${value}%` }} /></div>
}
