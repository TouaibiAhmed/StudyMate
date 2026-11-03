export function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton" aria-label="Loading dashboard" role="status">
      <span className="skeleton-lead" />
      <span className="skeleton-strip" />
      <div className="skeleton-columns"><div><span /><span /><span /></div><aside><span /><span /></aside></div>
    </div>
  )
}
