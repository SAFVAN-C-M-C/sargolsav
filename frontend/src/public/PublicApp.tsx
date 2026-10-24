import { useEffect, useMemo, useRef } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useOutletContext, useParams } from 'react-router-dom';
import { createPublicApi, PublicApiError, usePublicResource } from './publicApi';
import type { PublicApi } from './publicApi';
import { EmptyState, ErrorState, LoadingCards } from './PublicStates';
import { CategoryBrowser } from './CategoryBrowser';
import { categoryPath, resultsPath } from './publicPaths';

function PublicLayout({ api }: { api: PublicApi }) {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname) {
      main.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      previousPath.current = pathname;
    }
  }, [pathname]);
  return <div className="public-app">
    <a className="skip-link" href="#public-content">Skip to content</a>
    <header className="public-header"><Link className="brand" to="/" aria-label="Sargolsav home">
      <span className="brand-symbol" aria-hidden="true">✦</span><span>sargolsav<span className="brand-caption">CULTURE · COMMUNITY · EXCELLENCE</span></span>
    </Link><span className="header-note">Zonal Madrassa<br />Cultural Competition</span></header>
    <main ref={main} id="public-content" className="public-main" tabIndex={-1}>
      <Outlet context={api} />
    </main>
    <footer className="public-footer"><span>Celebrating talent. Bringing us together.</span><Link to="/admin/login">Admin sign in</Link></footer>
  </div>;
}

function PublicNavigation({ competitionId }: { competitionId?: string }) {
  const base = competitionId ? `/competitions/${encodeURIComponent(competitionId)}` : '';
  return <nav className="public-tabs" aria-label="Public navigation">
    <NavLink to={base ? `${base}/results` : '/'} end={!base}><span aria-hidden="true">▤</span> Results</NavLink>
    <NavLink to={`${base}/leaderboards`}><span aria-hidden="true">▥</span> Leaderboards</NavLink>
  </nav>;
}

function PublicHome({ leaderboards = false }: { leaderboards?: boolean }) {
  const api = useOutletContext<PublicApi>();
  const state = usePublicResource(api.competitions);
  if (state.status === 'ready' && state.data.length) {
    return <Navigate replace to={leaderboards ? `/competitions/${state.data[0].id}/leaderboards` : resultsPath(state.data[0].id)} />;
  }
  return <><p className="eyebrow">Welcome to Sargolsav</p><h1>A celebration of talent</h1>
    <p className="public-intro">Explore our cultural competition, one category at a time.</p><PublicNavigation />
    {state.status === 'loading' ? <LoadingCards /> : state.status === 'error' ? <ErrorState retry={api.competitions.retry} /> :
      <EmptyState title="No active competition">Our next competition will appear here when it is ready. Please check back later.</EmptyState>}</>;
}

function CompetitionPicker({ id, leaderboards }: { id: string; leaderboards: boolean }) {
  const api = useOutletContext<PublicApi>();
  const state = usePublicResource(api.competitions);
  if (state.status === 'loading') return <p role="status">Loading competitions…</p>;
  if (state.status === 'error') return <div className="picker-error" role="alert">Competition list unavailable. <button className="button-secondary" onClick={api.competitions.retry}>Retry competitions</button></div>;
  if (state.data.length < 2) return null;
  return <nav className="competition-picker" aria-label="Choose competition">{state.data.map((competition) =>
    <Link key={competition.id} aria-current={competition.id === id ? 'true' : undefined}
      to={leaderboards ? `/competitions/${competition.id}/leaderboards` : resultsPath(competition.id)}>{competition.name}</Link>)}</nav>;
}

function CompetitionPage({ leaderboards = false }: { leaderboards?: boolean }) {
  const { competitionId = '', categoryId, eventId } = useParams();
  const api = useOutletContext<PublicApi>();
  const entry = api.catalog(competitionId);
  const state = usePublicResource(entry);
  const category = state.status === 'ready' ? state.data.categories.find((item) => item.id === categoryId) : undefined;
  useEffect(() => {
    document.title = state.status === 'ready' ? `${category?.name ?? (leaderboards ? 'Leaderboards' : 'Results')} · ${state.data.competition.name} · Sargolsav` : 'Sargolsav';
  }, [state, category, leaderboards, eventId]);
  return <>
    <Link className="public-back" to={eventId && categoryId ? categoryPath(competitionId, categoryId) : categoryId ? resultsPath(competitionId) : '/'}>← {eventId ? 'All events' : categoryId ? 'All categories' : 'Home'}</Link>
    <p className="eyebrow">Zonal Madrassa Cultural Competition</p>
    <h1>{state.status === 'ready' ? state.data.competition.name : 'Competition'}</h1>
    <CompetitionPicker id={competitionId} leaderboards={leaderboards} />
    <PublicNavigation competitionId={competitionId} />
    {state.status === 'loading' ? <LoadingCards /> : state.status === 'error' ?
      state.error instanceof PublicApiError && [400, 404].includes(state.error.status) ?
        <EmptyState title="Competition unavailable">This competition may no longer be active. <Link to="/">Browse available competitions</Link>.</EmptyState> : <ErrorState retry={entry.retry} /> :
      leaderboards ? <EmptyState title="Leaderboards are coming soon">Unit and candidate standings will be available here in a future update.</EmptyState> :
        <CategoryBrowser competitionId={competitionId} categories={state.data.categories} categoryId={categoryId} eventId={eventId} />}
  </>;
}

function NotFound() {
  return <><h1>Page not found</h1><PublicNavigation /><EmptyState title="Let’s get you back"><Link to="/">Browse available competitions</Link></EmptyState></>;
}

export function PublicApp({ fetcher }: { fetcher: typeof fetch }) {
  const api = useMemo(() => createPublicApi(fetcher), [fetcher]);
  return <Routes><Route element={<PublicLayout api={api} />}>
    <Route index element={<PublicHome />} />
    <Route path="leaderboards" element={<PublicHome leaderboards />} />
    <Route path="competitions/:competitionId/results" element={<CompetitionPage />} />
    <Route path="competitions/:competitionId/results/categories/:categoryId" element={<CompetitionPage />} />
    <Route path="competitions/:competitionId/results/categories/:categoryId/events/:eventId" element={<CompetitionPage />} />
    <Route path="competitions/:competitionId/leaderboards" element={<CompetitionPage leaderboards />} />
    <Route path="*" element={<NotFound />} />
  </Route></Routes>;
}
