export function LoadingState({ label }: { label: string }) {
  return <div className="route-loading" role="status" aria-label={label}><span /><span /><span /></div>
}
