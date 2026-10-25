import { AdminAccountDiv, AdminBrandLink, AdminMenuToggleButtonSecondaryButton, AdminPickerDiv, AdminPublicLinkLink, AdminSidebarAside, AdminSidebarNoteP, AdminTopbarHeader, AdminWorkspaceBodyDiv, AdminWorkspaceDiv, ButtonSecondaryButton, DashboardMainMain, DashboardPanelAdminSelectionSection, DashboardPanelSection, EyebrowP, FieldLabel, AdminNavigationNav, SkipLinkA } from '../styles/components';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, UNSAFE_DataRouterContext, useLocation, useSearchParams } from 'react-router-dom';
import { loadCompetitions, type AdminCompetition } from '../api/adminDashboardApi';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminResource } from '../hooks/useAdminResource';
import { DashboardError, DashboardLoading } from '../components/admin/DashboardStates';
import { adminDestinations } from '../constants/adminNavigation';
import { AdminNavigationBlocker } from '../components/admin/AdminNavigationBlocker';

export function AdminLayout() {
  const { state: auth, logout, request } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const load = useCallback((signal: AbortSignal) => loadCompetitions(request, signal), [request]);
  const { state, retry, update } = useAdminResource(load);
  const dirtyForms = useRef(new Set<string>());
  const dataRouter = useContext(UNSAFE_DataRouterContext);
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
    if (id === (params.get('competition') ?? '') || (!dataRouter && !mayLeave())) return;
    const next = new URLSearchParams(params);
    next.delete('unit'); next.delete('madrasa'); next.delete('participantForm');
    next.delete('category'); next.delete('event'); next.delete('catalogForm');
    next.delete('correction'); next.delete('resultView');
    if (id) next.set('competition', id); else next.delete('competition');
    setParams(next);
  };
  const upsertCompetition = useCallback((competition: AdminCompetition) => {
    update((rows) => rows.some((row) => row.id === competition.id) ? rows.map((row) => row.id === competition.id ? competition : row) : [competition, ...rows]);
  }, [update]);
  const selectedId = params.get('competition');
  const competition = state.status === 'ready' ? state.data.find((item) => item.id === selectedId) : undefined;
  if (auth.status !== 'authorized') return null;
  return <AdminWorkspaceDiv onClickCapture={(event) => {
    if (dataRouter) return;
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (!link || link.getAttribute('href')?.startsWith('#') || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target === '_blank') return;
    if (link.pathname + link.search + link.hash !== location.pathname + location.search + location.hash && !mayLeave()) {
      event.preventDefault(); event.stopPropagation();
    }
  }}>
    {dataRouter && <AdminNavigationBlocker dirtyForms={dirtyForms} />}
    <SkipLinkA href="#admin-content">Skip to admin content</SkipLinkA>
    <AdminSidebarAside>
      <AdminBrandLink to={{ pathname: '/admin', search: location.search }}>Sargolsav<span>ADMIN WORKSPACE</span></AdminBrandLink>
      <AdminMenuToggleButtonSecondaryButton type="button" aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(!menuOpen)}>Menu</AdminMenuToggleButtonSecondaryButton>
      <AdminNavigationNav id="admin-navigation" mobileOpen={menuOpen} aria-label="Admin navigation">
        {adminDestinations.map(([path, label]) => <NavLink key={path} end to={{ pathname: `/admin${path ? `/${path}` : ''}`, search: location.search }} onClick={() => setMenuOpen(false)}>{label}</NavLink>)}
        <AdminPublicLinkLink to="/">Public home ↗</AdminPublicLinkLink>
      </AdminNavigationNav>
      <AdminSidebarNoteP>Competition administration<br />Sargolsav</AdminSidebarNoteP>
    </AdminSidebarAside>
    <AdminWorkspaceBodyDiv>
      <AdminTopbarHeader>
        <div><EyebrowP variant="topbar">Administration</EyebrowP><h1>Sargolsav admin</h1></div>
        <AdminAccountDiv><span>Signed in as<br /><strong>{auth.identity.email ?? auth.identity.uid}</strong></span><ButtonSecondaryButton type="button" onClick={() => { if (mayLeave()) void logout().catch(() => {}); }}>Sign out</ButtonSecondaryButton></AdminAccountDiv>
      </AdminTopbarHeader>
      <DashboardMainMain id="admin-content" tabIndex={-1}>
        <DashboardPanelAdminSelectionSection aria-labelledby="selection-title">
          <div><h2 id="selection-title">Your competition workspace</h2><p>Select a competition to view its overview. Active and historical competitions are available.</p></div>
          {state.status === 'ready' && state.data.length > 0 && <AdminPickerDiv><FieldLabel htmlFor="admin-competition">Competition</FieldLabel>
            <select id="admin-competition" value={competition?.id ?? ''} onChange={(event) => selectCompetition(event.target.value)}><option value="">Select a competition</option>{state.data.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status} · {item.code}</option>)}</select>
          </AdminPickerDiv>}
        </DashboardPanelAdminSelectionSection>
        {state.status === 'loading' && <DashboardLoading>Loading competitions…</DashboardLoading>}
        {state.status === 'error' && <DashboardError retry={retry}>Competitions are unavailable. Check your connection and try again.</DashboardError>}
        {state.status === 'ready' && <>
          {state.data.length === 0 ? <DashboardPanelSection><h2>No competitions yet</h2><p>Create your first competition on the Competitions screen.</p></DashboardPanelSection> :
            !competition && <DashboardPanelSection><h2>{selectedId ? 'Competition unavailable' : 'Select a competition'}</h2><p>{selectedId ? 'This competition is no longer available. Choose another competition above.' : 'Choose a competition above to see its overview.'}</p></DashboardPanelSection>}
          <Outlet context={{ competition, competitions: state.data, upsertCompetition, selectCompetition, setDirty }} />
        </>}
      </DashboardMainMain>
    </AdminWorkspaceBodyDiv>
  </AdminWorkspaceDiv>;
}
