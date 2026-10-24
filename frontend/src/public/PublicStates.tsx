export function LoadingCards() {
  return <div role="status" aria-label="Loading competitions and categories" className="loading-cards">
    <span className="sr-only">Loading competitions and categories…</span>
    {[1, 2, 3].map((key) => <div className="skeleton" aria-hidden="true" key={key} />)}
  </div>;
}

export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="public-state"><span className="state-mark" aria-hidden="true">◇</span>
    <h2>{title}</h2><p>{children}</p></section>;
}

export function ErrorState({ retry }: { retry: () => void }) {
  return <section className="public-state" role="alert"><h2>Unable to load this page</h2>
    <p>Check your connection and try again.</p><button onClick={retry}>Try again</button></section>;
}
