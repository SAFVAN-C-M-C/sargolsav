import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { loadCompetitions, type AdminCompetition } from '../api/adminDashboardApi';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminResource } from '../hooks/useAdminResource';
import { DashboardError, DashboardLoading } from '../components/admin/DashboardStates';
import { adminDestinations } from '../constants/adminNavigation';

export function AdminLayout() {
  const { state: auth, logout, request } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const load = useCallback((signal: AbortSignal) => loadCompetitions(request, signal), [request]);
  const { state, retry, update } = useAdminResource(load);
  const dirtyForms = useRef(new Set<string>());
  const setDirty = useCallback((key: string, dirty: boolean) => {
    if (dirty) dirtyForms.current.add(key); else dirtyForms.current.delete(key);
  }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyForms.current.size) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  const mayLeave = () => !dirtyForms.current.size || window.confirm('Discard unsaved changes? A request already sent may still complete.');
  const selectCompetition = (id: string) => {
    if (id === (params.get('competition') ?? '') || !mayLeave()) return;
    const next = new URLSearchParams(params);
    if (id) next.set('competition', id); else next.delete('competition');
    setParams(next);
  };
  const upsertCompetition = useCallback((competition: AdminCompetition) => {
    update((rows) => rows.some((row) => row.id === competition.id) ? rows.map((row) => row.id === competition.id ? competition : row) : [competition, ...rows]);
  }, [update]);
  const selectedId = params.get('competition');
  const competition = state.status === 'ready' ? state.data.find((item) => item.id === selectedId) : undefined;
  if (auth.status !== 'authorized') return null;
  return <div className="admin-workspace" onClickCapture={(event) => {
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (!link || link.getAttribute('href')?.startsWith('#') || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target === '_blank') return;
    if (link.pathname + link.search + link.hash !== location.pathname + location.search + location.hash && !mayLeave()) {
      event.preventDefault(); event.stopPropagation();
    }
  }}>
    <a className="skip-link" href="#admin-content">Skip to admin content</a>
    <aside className="admin-sidebar">
      <Link className="admin-brand" to={{ pathname: '/admin', search: location.search }}>Sargolsav<span>ADMIN WORKSPACE</span></Link>
      <button className="admin-menu-toggle button-secondary" type="button" aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(!menuOpen)}>Menu</button>
      <nav id="admin-navigation" className={menuOpen ? 'admin-navigation is-open' : 'admin-navigation'} aria-label="Admin navigation">
        {adminDestinations.map(([path, label]) => <NavLink key={path} end to={{ pathname: `/admin${path ? `/${path}` : ''}`, search: location.search }} onClick={() => setMenuOpen(false)}>{label}</NavLink>)}
        <Link className="admin-public-link" to="/">Public home ↗</Link>
      </nav>
      <p className="admin-sidebar-note">Competition administration<br />Sargolsav</p>
    </aside>
    <div className="admin-workspace-body">
      <header className="admin-topbar">
        <div><p className="eyebrow">Administration</p><h1>Sargolsav admin</h1></div>
        <div className="admin-account"><span>Signed in as<br /><strong>{auth.identity.email ?? auth.identity.uid}</strong></span><button className="button-secondary" type="button" onClick={() => { if (mayLeave()) void logout().catch(() => {}); }}>Sign out</button></div>
      </header>
      <main id="admin-content" className="dashboard-main" tabIndex={-1}>
        <section className="dashboard-panel admin-selection" aria-labelledby="selection-title">
          <div><h2 id="selection-title">Your competition workspace</h2><p>Select a competition to view its overview. Active and historical competitions are available.</p></div>
          {state.status === 'ready' && state.data.length > 0 && <div className="admin-picker"><label htmlFor="admin-competition">Competition</label>
            <select id="admin-competition" value={competition?.id ?? ''} onChange={(event) => selectCompetition(event.target.value)}><option value="">Select a competition</option>{state.data.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status} · {item.code}</option>)}</select>
          </div>}
        </section>
        {state.status === 'loading' && <DashboardLoading>Loading competitions…</DashboardLoading>}
        {state.status === 'error' && <DashboardError retry={retry}>Competitions are unavailable. Check your connection and try again.</DashboardError>}
        {state.status === 'ready' && <>
          {state.data.length === 0 ? <section className="dashboard-panel"><h2>No competitions yet</h2><p>Create your first competition on the Competitions screen.</p></section> :
            !competition && <section className="dashboard-panel"><h2>{selectedId ? 'Competition unavailable' : 'Select a competition'}</h2><p>{selectedId ? 'This competition is no longer available. Choose another competition above.' : 'Choose a competition above to see its overview.'}</p></section>}
          <Outlet context={{ competition, competitions: state.data, upsertCompetition, selectCompetition, setDirty }} />
        </>}
      </main>
    </div>
  </div>;
}
