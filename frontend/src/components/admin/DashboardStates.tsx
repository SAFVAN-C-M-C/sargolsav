export function DashboardLoading({ children }: { children: string }) {
  return <div className="dashboard-panel" role="status"><p>{children}</p><div className="skeleton" aria-hidden="true" /></div>;
}

export function DashboardError({ retry, children }: { retry: () => void; children: string }) {
  return <div className="dashboard-panel" role="alert"><h2>Could not load data</h2><p>{children}</p><button type="button" onClick={retry}>Try again</button></div>;
}
