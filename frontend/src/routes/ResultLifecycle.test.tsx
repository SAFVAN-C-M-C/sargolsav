import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../App';
import type { AuthClient, AuthUser } from '../types/auth';
import type { EventResult, LifecycleEntry, PublishedSnapshot, ResultCorrection } from '../types/resultLifecycle';
import type { WinnerPayload } from '../types/adminResults';

beforeAll(async () => { await import('../pages/admin/AdminResults'); });
const routers: ReturnType<typeof createMemoryRouter>[] = [];
afterEach(() => { cleanup(); routers.splice(0).forEach((router) => router.dispose()); });
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) }) as Response;
const stamp = '2026-10-25T00:00:00.000Z';
const winners = (): LifecycleEntry[] => [
  { id: '501', candidate_id: '101', candidate_code: '001', name: 'First winner', unit_id: '21', unit_name: 'North Unit', madrasa_id: '31', madrasa_name: 'Central Madrassa', position: 1, override_audit_id: null },
  { id: '502', candidate_id: '102', candidate_code: '002', name: 'Second winner', unit_id: '22', unit_name: 'South Unit', madrasa_id: null, madrasa_name: null, position: 7, override_audit_id: null },
];
const detail = '/admin/results?competition=1&category=11&event=111';
const reviewUrl = `${detail}&resultView=review`;
function Probe() { const location = useLocation(); const navigate = useNavigate(); return <><output data-testid="location">{location.pathname + location.search}</output><button onClick={() => void navigate(-1)}>Back</button><button onClick={() => void navigate(1)}>Forward</button></>; }
function setup({ status = 'draft', entries = winners(), path = reviewUrl, existingCorrection, signedIn = true, override }: {
  status?: EventResult['status']; entries?: LifecycleEntry[]; path?: string; existingCorrection?: 'draft' | 'reviewed' | 'applied'; signedIn?: boolean;
  override?: (path: string, options: RequestInit) => Promise<Response | undefined>;
} = {}) {
  let sequence = 123; let publicationId = 900;
  const nextVersion = () => `${++sequence}:20261025000000.123456`;
  let live: EventResult = { id: '100', competition_id: '1', category_id: '11', event_id: '111', status, version: '123:20261025000000.123456', updated_at: stamp, entries: structuredClone(entries), reviewed_by: status === 'draft' ? null : 'review-admin', reviewed_at: status === 'draft' ? null : stamp, published_by: status === 'published' ? 'publisher-admin' : null, published_at: status === 'published' ? stamp : null, active_correction_id: null };
  const snapshot = (): PublishedSnapshot => ({ competition_id: '1', category_id: '11', event_id: '111', category_name: 'Entry category', event_name: 'Recital', publication_id: String(publicationId), published_at: stamp, winners: live.entries.map((entry) => ({ position: entry.position, candidate_code: entry.candidate_code, name: entry.name, unit: { id: entry.unit_id, name: entry.unit_name }, madrasa: entry.madrasa_id === null ? null : { id: entry.madrasa_id, name: entry.madrasa_name! } })) });
  let published = status === 'published' ? snapshot() : null;
  const history: PublishedSnapshot[] = published ? [structuredClone(published)] : [];
  const correctionRecord = (reason = 'Verify source sheet'): ResultCorrection => ({ id: '200', competition_id: '1', category_id: '11', event_id: '111', event_result_id: live.id, base_publication_id: String(publicationId), reason, status: 'draft', version: nextVersion(), updated_at: stamp, entries: structuredClone(live.entries), reviewed_by: null, reviewed_at: null, applied_by: null, applied_at: null });
  let correction: ResultCorrection | null = existingCorrection ? { ...correctionRecord(), status: existingCorrection, reviewed_by: existingCorrection === 'draft' ? null : 'correction-reviewer', reviewed_at: existingCorrection === 'draft' ? null : stamp, applied_by: existingCorrection === 'applied' ? 'correction-publisher' : null, applied_at: existingCorrection === 'applied' ? stamp : null } : null;
  const active = () => correction && correction.status !== 'applied' ? correction.id : null;
  const currentUser: AuthUser = { uid: 'admin', email: 'admin@example.test', getIdToken: vi.fn(async (refresh) => refresh ? 'fresh' : 'opaque') };
  let listener: (user: AuthUser | null) => void;
  const client: AuthClient = { subscribe: (fn) => { listener = fn; queueMicrotask(() => fn(signedIn ? currentUser : null)); return () => {}; }, signIn: vi.fn(async () => {}), signOut: vi.fn(async () => listener(null)) };
  const fetcher = vi.fn(async (url: string | URL | Request, options: RequestInit = {}) => {
    const path = String(url); const method = options.method ?? 'GET';
    if (path === '/api/admin/me') return reply({ uid: 'admin', email: currentUser.email, emailVerified: true, admin: true });
    const custom = await override?.(path, options); if (custom) return custom;
    if (path === '/api/admin/competitions') return reply({ competitions: [{ id: '1', name: 'First competition', code: 'C1', status: 'active' }, { id: '2', name: 'Second competition', code: 'C2', status: 'archived' }] });
    const comp = path.split('/')[4];
    if (path.endsWith('/categories')) return reply({ categories: [{ id: '11', competition_id: comp, name: 'Entry category', sort_order: 0 }] });
    if (path.endsWith('/categories/11')) return reply({ category: { id: '11', competition_id: comp, name: 'Entry category', sort_order: 0 } });
    if (path.endsWith('/events/111')) return reply({ event: { id: '111', competition_id: comp, category_id: '11', name: 'Recital', sort_order: 0 } });
    if (path.endsWith('/result-statuses')) return reply({ results: comp === '2' ? [] : [{ event_id: '111', category_id: '11', event_name: 'Recital', event_result_id: live.id, status: live.status, updated_at: live.updated_at }] });
    if (path.endsWith('/settings')) return reply({ settings: { competition_id: comp, position_points: { '1': 5, '7': 0 } } });
    if (path.endsWith('/units')) return reply({ units: [{ id: '21', competition_id: comp, name: 'North Unit' }, { id: '22', competition_id: comp, name: 'South Unit' }] });
    if (path.endsWith('/madrasas')) return reply({ madrasas: path.includes('/21/') ? [{ id: '31', competition_id: comp, unit_id: '21', name: 'Central Madrassa' }] : [] });
    if (path.includes('/candidates/lookup')) {
      const code = new URL(path, 'http://local').searchParams.get('candidate_code');
      const existing = live.entries.find((entry) => entry.candidate_code === code);
      return existing ? reply({ candidate: { id: existing.candidate_id, competition_id: '1', category_id: '11', candidate_code: code, name: existing.name, unit_id: existing.unit_id, madrasa_id: existing.madrasa_id } }) : reply({ error: 'Candidate not found' }, 404);
    }
    if (path.startsWith('/api/competitions/') && path.endsWith('/result')) return published ? reply({ result: published }) : reply({ error: 'Published result not found' }, 404);
    const body = options.body ? JSON.parse(String(options.body)) : {};
    const sharedSave = path.endsWith('/shared-positions');
    const savedEntries = (entries: WinnerPayload[]): LifecycleEntry[] => entries.map((entry, index) => ({ ...entry, id: String(601 + index), candidate_id: live.entries.find((existing) => existing.candidate_code === entry.candidate_code)?.candidate_id ?? String(201 + index), unit_name: entry.unit_id === '21' ? 'North Unit' : 'South Unit', madrasa_name: entry.madrasa_id ? 'Central Madrassa' : null, override_audit_id: sharedSave && entries.filter((other) => other.position === entry.position).length > 1 ? '777' : null }));
    if (path.endsWith('/result-draft') || path.endsWith('/result-draft/shared-positions')) {
      if (live.status !== 'draft') return reply({ error: 'Only draft results can be managed through this endpoint' }, 409);
      if (method === 'PUT') {
        if (body.version !== live.version) return reply({ error: 'Draft changed; retrieve the latest version before saving' }, 409);
        if (!sharedSave && (live.entries.some((entry) => entry.override_audit_id) || new Set(body.entries.map((entry: WinnerPayload) => entry.position)).size !== body.entries.length)) return reply({ error: 'Shared positions require explicit approval' }, 409);
        live = { ...live, version: nextVersion(), entries: savedEntries(body.entries) };
      }
      return reply({ draft: live });
    }
    const root = '/api/admin/competitions/1/categories/11/events/111/result';
    if (path === root && method === 'GET') return reply({ result: { ...live, active_correction_id: active() } });
    if (path === `${root}/corrections` && method === 'POST') {
      if (body.version !== live.version || active()) return reply({ error: active() ? 'An active correction already exists' : 'Result changed; retrieve the latest version before retrying' }, 409);
      correction = correctionRecord(body.reason); return reply({ correction }, 201);
    }
    const isCorrection = path.includes('/corrections/');
    const row = isCorrection ? correction : live;
    if (!row) return reply({ error: 'Correction not found' }, 404);
    if (isCorrection && method === 'GET') return reply({ correction });
    if (method === 'PUT' && isCorrection) {
      if (body.version !== row.version || row.status !== 'draft') return reply({ error: 'Result changed; retrieve the latest version before retrying' }, 409);
      if (!sharedSave && (row.entries.some((entry) => entry.override_audit_id) || new Set(body.entries.map((entry: WinnerPayload) => entry.position)).size !== body.entries.length)) return reply({ error: 'Shared positions require explicit approval' }, 409);
      correction = { ...correction!, version: nextVersion(), entries: savedEntries(body.entries) };
      return reply({ correction });
    }
    const action = path.split('/').at(-1);
    if (method === 'POST' && ['review', 'return-to-draft', 'publish'].includes(action!)) {
      if (body.version !== row.version) return reply({ error: 'Result changed; retrieve the latest version before retrying' }, 409);
      if (row.status !== (action === 'review' ? 'draft' : 'reviewed')) return reply({ error: 'Operation requires reviewed status' }, 409);
      if (action !== 'return-to-draft' && ![1, 7].every((position) => row.entries.some((entry) => entry.position === position))) return reply({ error: 'Review and publication require a winner for every configured position' }, 400);
      if (isCorrection) {
        correction = { ...correction!, version: nextVersion(), status: action === 'review' ? 'reviewed' : action === 'publish' ? 'applied' : 'draft', reviewed_by: action === 'return-to-draft' ? null : 'correction-reviewer', reviewed_at: action === 'return-to-draft' ? null : stamp };
        if (action === 'publish') { live = { ...live, entries: structuredClone(correction.entries), version: nextVersion(), published_by: 'correction-publisher', published_at: stamp, reviewed_by: correction.reviewed_by, reviewed_at: correction.reviewed_at }; correction = { ...correction, applied_by: 'correction-publisher', applied_at: stamp }; published = snapshot(); publicationId++; published.publication_id = String(publicationId); history.push(structuredClone(published)); }
        return reply({ correction });
      }
      live = { ...live, version: nextVersion(), status: action === 'review' ? 'reviewed' : action === 'publish' ? 'published' : 'draft', reviewed_by: action === 'return-to-draft' ? null : 'review-admin', reviewed_at: action === 'return-to-draft' ? null : stamp };
      if (action === 'publish') { live = { ...live, published_by: 'publisher-admin', published_at: stamp }; published = snapshot(); history.push(structuredClone(published)); }
      return reply({ result: live });
    }
    return reply({ error: 'Not found' }, 404);
  });
  const router = createMemoryRouter([{ path: '*', element: <><AppRoutes client={client} fetcher={fetcher as typeof fetch} /><Probe /></> }], { initialEntries: ['/admin/results?competition=1', path] }); routers.push(router);
  render(<RouterProvider router={router} />);
  return { user: userEvent.setup(), fetcher, client, writes: () => fetcher.mock.calls.map(([path, options = {}]) => [path, options] as const).filter(([, options]) => options.method && options.method !== 'GET'),
    live: () => structuredClone(live), correction: () => structuredClone(correction), published: () => structuredClone(published), history,
    changeVersion: () => { live.version = nextVersion(); if (correction) correction.version = nextVersion(); }, renameRegistry: () => { live.entries[0].name = 'Renamed live registry'; } };
}

test('complete saved draft review displays every winner and posts the exact version', async () => {
  const { user, writes } = setup(); const summary = within(await screen.findByRole('region', { name: 'Winners for verification' }));
  expect(summary.getByText('001')).toBeTruthy(); expect(summary.getByText('North Unit')).toBeTruthy(); expect(summary.getByText('Central Madrassa')).toBeTruthy(); expect(summary.getByText('None')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Review result' })); await screen.findByText('Result reviewed.'); await screen.findByText('review-admin');
  expect(JSON.parse(String(writes()[0][1].body))).toEqual({ version: '123:20261025000000.123456' }); expect(screen.getByRole('button', { name: 'Publish result' })).toBeTruthy();
});

test('incomplete review is disabled while the original draft remains editable', async () => {
  const { user, writes } = setup({ entries: winners().slice(0, 1) }); await screen.findByText('Missing required positions: 7.');
  expect(screen.getByRole('button', { name: 'Review result' }).matches(':disabled')).toBe(true); expect(writes()).toHaveLength(0);
  await user.click(screen.getByRole('link', { name: 'Edit incomplete or changed draft' })); await screen.findByRole('form', { name: 'Event result draft' });
});

test('reviewed results return to draft through a versioned transition, never ordinary PUT', async () => {
  const { user, writes } = setup({ status: 'reviewed', path: detail }); await user.click(await screen.findByRole('button', { name: 'Return to draft' })); await screen.findByText('Result returned to draft.'); await screen.findByRole('form', { name: 'Event result draft' });
  expect(writes()[0][0]).toMatch(/\/result\/return-to-draft$/); expect(writes()[0][1].method).toBe('POST');
});

test('publication dialog shows exact winners, defaults focus to cancel and cancellation sends no request', async () => {
  const { user, writes } = setup({ status: 'reviewed' }); const trigger = await screen.findByRole('button', { name: 'Publish result' }); await user.click(trigger);
  const dialog = within(screen.getByRole('dialog')); expect(dialog.getByText(/changes leaderboard standings/)).toBeTruthy(); expect(dialog.getByText('001')).toBeTruthy(); expect(dialog.getByText('Position 7: Second winner')).toBeTruthy();
  expect(document.activeElement).toBe(dialog.getByRole('button', { name: 'Cancel publication' })); await user.click(dialog.getByRole('button', { name: 'Cancel publication' })); expect(writes()).toHaveLength(0); expect(document.activeElement).toBe(trigger);
});

test('publication prevents duplicate submits and claims success only after confirmation from the backend', async () => {
  let release!: () => void;
  const context = setup({ status: 'reviewed', override: async (path, options) => path.endsWith('/publish') && options.method === 'POST' ? new Promise((resolve) => { release = () => resolve(undefined); }) : undefined });
  await context.user.click(await screen.findByRole('button', { name: 'Publish result' })); await context.user.dblClick(screen.getByRole('button', { name: 'Confirm publication' }));
  await waitFor(() => expect(context.writes()).toHaveLength(1)); expect(screen.queryByText('Result published.')).toBeNull(); expect(screen.getByRole('button', { name: 'Publishing…' }).matches(':disabled')).toBe(true);
  await act(async () => release()); await screen.findByText('Result published.'); await screen.findByRole('region', { name: 'Current public result' }); expect(context.live().status).toBe('published'); expect(screen.queryByRole('dialog')).toBeNull();
});

test('reviewed version returned by review is used verbatim for publication', async () => {
  const context = setup(); await context.user.click(await screen.findByRole('button', { name: 'Review result' })); await screen.findByText('Result reviewed.'); const version = context.live().version;
  await context.user.click(screen.getByRole('button', { name: 'Publish result' })); await context.user.click(screen.getByRole('button', { name: 'Confirm publication' })); await screen.findByText('Result published.'); expect(JSON.parse(String(context.writes()[1][1].body))).toEqual({ version });
});

test('published winners come from frozen snapshots rather than mutable registry metadata', async () => {
  const context = setup({ status: 'published', path: detail }); context.renameRegistry(); const pane = within(await screen.findByRole('region', { name: 'Current public result' }));
  expect(pane.getByText('Position 1: First winner')).toBeTruthy(); expect(pane.queryByText(/Renamed live registry/)).toBeNull();
  const request = context.fetcher.mock.calls.find(([path]) => String(path).startsWith('/api/competitions/'));
  expect(request?.[1]?.headers).toEqual({ Accept: 'application/json' }); expect(screen.queryByRole('button', { name: 'Return to draft' })).toBeNull();
});

test('correction reason is required, start uses the published version, and an existing workspace is resumed', async () => {
  const context = setup({ status: 'published', path: detail }); await context.user.click(await screen.findByRole('button', { name: 'Start correction' })); expect((await screen.findByRole('alert')).textContent).toContain('reason'); expect(context.writes()).toHaveLength(0);
  await context.user.type(screen.getByLabelText('Correction reason'), ' Verify source sheet '); await context.user.click(screen.getByRole('button', { name: 'Start correction' })); await screen.findByRole('form', { name: 'Result correction draft' });
  expect(JSON.parse(String(context.writes()[0][1].body))).toEqual({ version: '123:20261025000000.123456', reason: ' Verify source sheet ' }); expect(screen.getByTestId('location').textContent).toContain('correction=200'); expect(screen.getByText('Correction in Progress')).toBeTruthy();
  cleanup(); const second = setup({ status: 'published', path: detail, existingCorrection: 'draft' }); await second.user.click(await screen.findByRole('link', { name: 'Resume correction' })); await screen.findByRole('form', { name: 'Result correction draft' }); expect(second.writes()).toHaveLength(0);
});

test('private correction save/review preserve the public snapshot until atomic correction publication', async () => {
  const context = setup({ status: 'published', existingCorrection: 'draft', path: `${detail}&correction=200&resultView=correction` }); const old = context.published();
  const form = within(await screen.findByRole('form', { name: 'Result correction draft' })); const secondRow = within(form.getByRole('group', { name: 'Winner 2' }));
  await context.user.clear(secondRow.getByLabelText('External candidate ID')); await context.user.type(secondRow.getByLabelText('External candidate ID'), '0009'); await context.user.click(secondRow.getByRole('button', { name: 'Look up candidate' })); await secondRow.findByText(/New candidate/);
  await context.user.type(secondRow.getByLabelText('Candidate name'), 'Corrected winner'); await context.user.selectOptions(secondRow.getByLabelText('Unit'), '22');
  const beforeSave = context.correction()!.version; await context.user.click(form.getByRole('button', { name: 'Save correction' })); await screen.findByText('Correction saved privately.');
  expect(context.writes()[0][0]).toMatch(/\/result\/corrections\/200$/); expect(JSON.parse(String(context.writes()[0][1].body)).version).toBe(beforeSave); expect(context.published()).toEqual(old);
  const publicPane = within(screen.getByRole('region', { name: 'Current public result' })); expect(publicPane.getByText('Position 7: Second winner')).toBeTruthy(); expect(publicPane.queryByText(/Corrected winner/)).toBeNull();
  await context.user.click(screen.getByRole('link', { name: 'Review saved correction' })); await context.user.click(await screen.findByRole('button', { name: 'Review correction' })); await screen.findByText('Correction reviewed.'); expect(context.published()).toEqual(old);
  const reviewedVersion = context.correction()!.version; await context.user.click(screen.getByRole('button', { name: 'Publish correction' })); expect(within(screen.getByRole('dialog')).getByText('Position 7: Corrected winner')).toBeTruthy();
  await context.user.click(screen.getByRole('button', { name: 'Confirm publication' })); await screen.findByText('Correction published.');
  await waitFor(() => expect(within(screen.getByRole('region', { name: 'Current public result' })).getByText('Position 7: Corrected winner')).toBeTruthy());
  expect(context.published()!.publication_id).not.toBe(old!.publication_id); expect(context.history).toHaveLength(2); expect(context.history[0]).toEqual(old); expect(context.correction()!.status).toBe('applied');
  expect(JSON.parse(String(context.writes().at(-1)![1].body))).toEqual({ version: reviewedVersion });
  expect(context.writes().some(([path]) => String(path).includes('/result-draft') || String(path).includes('/shared-positions'))).toBe(false);
});

test('reviewed corrections return to their own draft workspace with their own version', async () => {
  const context = setup({ status: 'published', existingCorrection: 'reviewed', path: `${detail}&correction=200&resultView=correction` }); const version = context.correction()!.version;
  await context.user.click(await screen.findByRole('button', { name: 'Return to draft' })); await screen.findByText('Correction returned to draft.'); await screen.findByRole('form', { name: 'Result correction draft' });
  expect(context.writes()[0][0]).toMatch(/\/corrections\/200\/return-to-draft$/); expect(JSON.parse(String(context.writes()[0][1].body))).toEqual({ version });
});

test('stale publication is blocked without losing the verified list and can be safely reloaded', async () => {
  const context = setup({ status: 'reviewed' }); await context.user.click(await screen.findByRole('button', { name: 'Publish result' })); context.changeVersion();
  await context.user.click(screen.getByRole('button', { name: 'Confirm publication' })); const dialog = within(screen.getByRole('dialog')); expect((await dialog.findByRole('alert')).textContent).toContain('Result changed'); expect(dialog.getByRole('button', { name: 'Confirm publication' }).matches(':disabled')).toBe(true);
  await context.user.click(dialog.getByRole('button', { name: 'Cancel publication' })); await context.user.click(screen.getByRole('button', { name: 'Reload result' })); await screen.findByRole('button', { name: 'Publish result' }); expect(context.published()).toBeNull();
});

test('incomplete private corrections remain editable but cannot pass review', async () => {
  const context = setup({ status: 'published', entries: winners().slice(0, 1), existingCorrection: 'draft', path: `${detail}&correction=200&resultView=correction-review` });
  await screen.findByText('Missing required positions: 7.'); expect(screen.getByRole('button', { name: 'Review correction' }).matches(':disabled')).toBe(true); await context.user.click(screen.getByRole('link', { name: 'Edit correction' })); await screen.findByRole('form', { name: 'Result correction draft' }); expect(context.writes()).toHaveLength(0);
});

test('stale correction saves retain entered values and reload only after explicit discard approval', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const context = setup({ status: 'published', existingCorrection: 'draft', path: `${detail}&correction=200&resultView=correction` });
  const form = within(await screen.findByRole('form', { name: 'Result correction draft' })); await context.user.selectOptions(form.getAllByLabelText('Winning position')[0], '7'); context.changeVersion();
  // Keep the list valid while changing both positions.
  await context.user.selectOptions(form.getAllByLabelText('Winning position')[1], '1'); await context.user.click(form.getByRole('button', { name: 'Save correction' }));
  await screen.findByText('Result changed; retrieve the latest version before retrying'); expect(form.getByRole('button', { name: 'Save correction' }).matches(':disabled')).toBe(true);
  await context.user.click(form.getByRole('button', { name: 'Reload correction' })); expect((form.getAllByLabelText('Winning position')[0] as HTMLSelectElement).value).toBe('7');
  confirm.mockReturnValue(true); await context.user.click(form.getByRole('button', { name: 'Reload correction' })); await waitFor(() => expect((screen.getAllByLabelText('Winning position')[0] as HTMLSelectElement).value).toBe('1'));
  expect(context.published()!.winners[0].position).toBe(1);
});

test('a conflicting correction start preserves reason and requires reload rather than another POST', async () => {
  const context = setup({ status: 'published', path: detail, override: async (path, options) => path.endsWith('/corrections') && options.method === 'POST' ? reply({ error: 'An active correction already exists' }, 409) : undefined });
  await context.user.type(await screen.findByLabelText('Correction reason'), 'Reason retained'); await context.user.click(screen.getByRole('button', { name: 'Start correction' }));
  expect((await screen.findByRole('alert')).textContent).toContain('active correction already exists'); expect((screen.getByLabelText('Correction reason') as HTMLInputElement).value).toBe('Reason retained'); expect(screen.getByRole('button', { name: 'Start correction' }).matches(':disabled')).toBe(true); expect(context.writes()).toHaveLength(1);
});

test('correction creation has a synchronous duplicate submission guard', async () => {
  let release!: () => void;
  const context = setup({ status: 'published', path: detail, override: async (path, options) => path.endsWith('/corrections') && options.method === 'POST' ? new Promise((resolve) => { release = () => resolve(undefined); }) : undefined });
  await context.user.type(await screen.findByLabelText('Correction reason'), 'Verified'); await context.user.dblClick(screen.getByRole('button', { name: 'Start correction' })); await waitFor(() => expect(context.writes()).toHaveLength(1));
  expect(screen.getByRole('button', { name: 'Starting…' }).matches(':disabled')).toBe(true); await act(async () => release()); await screen.findByRole('form', { name: 'Result correction draft' });
});

test('post-review fingerprint conflicts show errors and never claim successful publication', async () => {
  const context = setup({ status: 'reviewed', override: async (path, options) => path.endsWith('/publish') && options.method === 'POST' ? reply({ error: 'Result information or points configuration changed after review; return to draft and review again' }, 409) : undefined });
  await context.user.click(await screen.findByRole('button', { name: 'Publish result' })); await context.user.click(screen.getByRole('button', { name: 'Confirm publication' }));
  expect((await within(screen.getByRole('dialog')).findByRole('alert')).textContent).toContain('configuration changed after review'); expect(context.published()).toBeNull(); expect(screen.queryByText('Result published.')).toBeNull();
});

test('backend completeness validation remains authoritative after initial client validation', async () => {
  const context = setup({ override: async (path, options) => path.endsWith('/review') && options.method === 'POST' ? reply({ error: 'Review and publication require a winner for every configured position' }, 400) : undefined });
  await context.user.click(await screen.findByRole('button', { name: 'Review result' })); expect((await screen.findByRole('alert')).textContent).toContain('every configured position'); expect(screen.queryByText('Result reviewed.')).toBeNull(); expect(screen.getByText('Position 1: First winner')).toBeTruthy();
});

test.each(['main', 'public', 'correction'])('%s read failures show retry without enabling unsafe actions', async (kind) => {
  let fail = true;
  const context = setup({ status: 'published', existingCorrection: kind === 'correction' ? 'draft' : undefined, path: kind === 'correction' ? `${detail}&correction=200&resultView=correction` : detail,
    override: async (path) => fail && (kind === 'public' ? path.startsWith('/api/competitions/') : kind === 'main' ? path.endsWith('/result') && path.startsWith('/api/admin/') : path.endsWith('/corrections/200')) ? reply({}, 503) : undefined });
  await screen.findByRole('alert'); expect(screen.queryByRole('button', { name: 'Publish correction' })).toBeNull(); fail = false; await context.user.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole(kind === 'correction' ? 'form' : 'region', { name: kind === 'correction' ? 'Result correction draft' : 'Current public result' });
});

test('private correction forms retain existing Back/Forward, internal and unload protection', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const context = setup({ status: 'published', existingCorrection: 'draft', path: `${detail}&correction=200&resultView=correction` });
  await screen.findByRole('form', { name: 'Result correction draft' }); await context.user.selectOptions(screen.getAllByLabelText('Winning position')[0], '7');
  await context.user.click(screen.getByRole('button', { name: 'Back' })); expect(screen.getByRole('form', { name: 'Result correction draft' })).toBeTruthy();
  await context.user.click(screen.getByRole('link', { name: 'Review saved correction' })); expect(confirm).toHaveBeenCalledTimes(2);
  const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
});

test('publication confirmation supports keyboard focus cycling and Escape cancellation', async () => {
  const context = setup({ status: 'reviewed' }); const trigger = await screen.findByRole('button', { name: 'Publish result' }); await context.user.click(trigger);
  const dialog = within(screen.getByRole('dialog')); await context.user.tab({ shift: true }); expect(document.activeElement).toBe(dialog.getByRole('button', { name: 'Confirm publication' }));
  await context.user.tab(); expect(document.activeElement).toBe(dialog.getByRole('button', { name: 'Cancel publication' })); await context.user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).toBeNull(); expect(context.writes()).toHaveLength(0); expect(document.activeElement).toBe(trigger);
});

test('applied correction history is read-only and no correction cancellation is offered', async () => {
  setup({ status: 'published', existingCorrection: 'applied', path: `${detail}&correction=200&resultView=correction` });
  await screen.findByText(/Correction applied\. This workspace is read-only/); expect(screen.queryByRole('button', { name: 'Save correction' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Publish correction' })).toBeNull(); expect(screen.queryByRole('button', { name: /cancel correction/i })).toBeNull(); expect(screen.getByText('correction-publisher')).toBeTruthy();
});

test('wrong-scope correction responses are rejected before entry editing', async () => {
  setup({ status: 'published', existingCorrection: 'draft', path: `${detail}&correction=200&resultView=correction`, override: async (path) => path.endsWith('/corrections/200') ? reply({ correction: { id: '200', competition_id: '2' } }) : undefined });
  await screen.findByRole('alert'); expect(screen.queryByRole('form', { name: 'Result correction draft' })).toBeNull(); expect(screen.getByRole('region', { name: 'Current public result' })).toBeTruthy();
});

test('network failure retains correction data and never changes the public snapshot', async () => {
  const context = setup({ status: 'published', existingCorrection: 'draft', path: `${detail}&correction=200&resultView=correction`, override: async (_path, options) => { if (options.method === 'PUT') throw new Error('private transport details'); return undefined; } }); const before = context.published();
  await screen.findByRole('form', { name: 'Result correction draft' }); await context.user.selectOptions(screen.getAllByLabelText('Winning position')[0], '7'); await context.user.selectOptions(screen.getAllByLabelText('Winning position')[1], '1'); await context.user.click(screen.getByRole('button', { name: 'Save correction' }));
  await screen.findByRole('alert'); expect((screen.getAllByLabelText('Winning position')[0] as HTMLSelectElement).value).toBe('7'); expect(context.published()).toEqual(before); expect(document.body.textContent).not.toContain('private transport details');
});

test.each([401, 403])('lifecycle authorization failure %s removes protected actions without navigation blocking', async (status) => {
  const context = setup({ status: 'reviewed', override: async (path, options) => path.endsWith('/publish') && options.method === 'POST' ? reply({}, status) : undefined });
  await context.user.click(await screen.findByRole('button', { name: 'Publish result' })); await context.user.click(screen.getByRole('button', { name: 'Confirm publication' })); await screen.findByRole('heading', { name: status === 401 ? 'Sign in' : 'Access denied' }); expect(screen.queryByRole('dialog')).toBeNull(); expect(context.writes()).toHaveLength(status === 401 ? 2 : 1);
});

test('late publication responses cannot overwrite a newly selected competition', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true); let release!: () => void;
  const context = setup({ status: 'reviewed', override: async (path, options) => path.endsWith('/publish') && options.method === 'POST' ? new Promise((resolve) => { release = () => resolve(undefined); }) : undefined });
  await context.user.click(await screen.findByRole('button', { name: 'Publish result' })); await context.user.click(screen.getByRole('button', { name: 'Confirm publication' })); await waitFor(() => expect(context.writes()).toHaveLength(1));
  // Programmatic navigation is still guarded while a modal/write is active.
  await act(async () => { await routers.at(-1)!.navigate('/admin/results?competition=2'); }); await screen.findByText('No events in this category.');
  await act(async () => release()); expect(screen.queryByText('Result published.')).toBeNull(); expect(screen.getByTestId('location').textContent).toBe('/admin/results?competition=2');
});

const tieReason = 'Judges confirmed equal marks on the signed sheet';
const tiedWinners = (): LifecycleEntry[] => [
  { ...winners()[0], override_audit_id: '700' },
  { ...winners()[1], position: 1, override_audit_id: '700' },
  { ...winners()[1], id: '503', candidate_id: '103', candidate_code: '003', name: 'Third winner', position: 7 },
];
async function enableOverride(context: ReturnType<typeof setup>, reason = tieReason) {
  await context.user.click(await screen.findByRole('checkbox', { name: 'Allow Shared Positions' }));
  if (reason) await context.user.type(screen.getByLabelText('Shared-position override reason'), reason);
}
async function addSharedWinner(context: ReturnType<typeof setup>, code = '0009') {
  await context.user.click(screen.getByRole('button', { name: 'Add winner' }));
  const groups = screen.getAllByRole('group', { name: /^Winner \d/ }); const row = within(groups.at(-1)!);
  await context.user.type(row.getByLabelText('External candidate ID'), code);
  await context.user.click(row.getByRole('button', { name: 'Look up candidate' }));
  await row.findByText(/New candidate/); await context.user.type(row.getByLabelText('Candidate name'), 'Additional shared winner');
  await context.user.selectOptions(row.getByLabelText('Unit'), '22'); await context.user.selectOptions(row.getByLabelText('Winning position'), '1');
  return row;
}
async function openOverride(context: ReturnType<typeof setup>) {
  await context.user.click(screen.getByRole('button', { name: 'Save shared-position override' }));
  return within(await screen.findByRole('dialog', { name: 'Confirm shared-position override' }));
}

test('sharing stays off by default, normal duplicates fail and opt-in allows extra winner rows', async () => {
  const context = setup({ path: detail }); const checkbox = await screen.findByRole('checkbox', { name: 'Allow Shared Positions' });
  expect((checkbox as HTMLInputElement).checked).toBe(false); expect(screen.getByRole('button', { name: 'Add winner' }).matches(':disabled')).toBe(true);
  await context.user.selectOptions(screen.getAllByLabelText('Winning position')[1], '1'); await context.user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Duplicate positions'); expect(context.writes()).toHaveLength(0);
  await enableOverride(context, ''); expect(screen.getByRole('button', { name: 'Add winner' }).matches(':disabled')).toBe(false);
  await context.user.click(screen.getByRole('button', { name: 'Save shared-position override' })); expect(screen.getByRole('alert').textContent).toContain('Override reason'); expect(screen.queryByRole('dialog')).toBeNull();
});

test('override confirmation shows exact groups, cancels with keyboard and retains all input', async () => {
  const context = setup({ path: detail }); await enableOverride(context); await context.user.selectOptions(screen.getAllByLabelText('Winning position')[1], '1');
  const dialog = await openOverride(context); expect(dialog.getByText('Shared position 1')).toBeTruthy(); expect(dialog.getByText('001')).toBeTruthy(); expect(dialog.getByText(tieReason)).toBeTruthy();
  expect(document.activeElement).toBe(dialog.getByRole('button', { name: 'Cancel override' })); await context.user.tab({ shift: true }); expect(document.activeElement).toBe(dialog.getByRole('button', { name: 'Confirm override' }));
  await context.user.tab(); expect(document.activeElement).toBe(dialog.getByRole('button', { name: 'Cancel override' })); await context.user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull(); expect(context.writes()).toHaveLength(0); expect((screen.getByLabelText('Shared-position override reason') as HTMLTextAreaElement).value).toBe(tieReason);
  expect((screen.getAllByLabelText('Winning position')[1] as HTMLSelectElement).value).toBe('1');
  await openOverride(context); await context.user.click(screen.getByRole('button', { name: 'Cancel override' })); expect(context.writes()).toHaveLength(0);
});

test('explicit draft save echoes exact token, whole entries and reason, then clears opt-in without enabling it persistently', async () => {
  const context = setup({ path: detail }); const version = context.live().version;
  await enableOverride(context); await context.user.selectOptions(screen.getAllByLabelText('Winning position')[1], '1'); await openOverride(context); await context.user.click(screen.getByRole('button', { name: 'Confirm override' }));
  await screen.findByText(/Shared-position changes saved privately/); const [path, options] = context.writes()[0];
  expect(path).toMatch(/\/result-draft\/shared-positions$/); expect(JSON.parse(String(options.body))).toEqual({ version, shared_positions: true, reason: tieReason, entries: winners().map((entry) => ({ candidate_code: entry.candidate_code, name: entry.name, unit_id: entry.unit_id, madrasa_id: entry.madrasa_id, position: 1 })) });
  expect(new Headers(options.headers).get('Authorization')).toBe('Bearer opaque'); expect(context.live().entries.every((entry) => entry.override_audit_id !== null)).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Allow Shared Positions' }) as HTMLInputElement).checked).toBe(false); expect(screen.queryByLabelText('Shared-position override reason')).toBeNull();
  await context.user.click(screen.getByRole('button', { name: 'Save draft' })); expect(screen.getByRole('alert').textContent).toMatch(/Duplicate positions|fresh reason/); expect(context.writes()).toHaveLength(1);
  await context.user.click(screen.getByRole('link', { name: 'Review saved result' })); await screen.findByText('Missing required positions: 7.'); expect(screen.getByRole('button', { name: 'Review result' }).matches(':disabled')).toBe(true);
});

test.each(['draft', 'correction'])('existing %s overrides can remove ties explicitly and then use ordinary saving', async (kind) => {
  const correction = kind === 'correction';
  const context = setup({ status: correction ? 'published' : 'draft', entries: tiedWinners(), existingCorrection: correction ? 'draft' : undefined, path: correction ? `${detail}&correction=200&resultView=correction` : detail });
  await screen.findByRole('checkbox', { name: 'Allow Shared Positions' }); const oldPublic = context.published();
  await context.user.click(screen.getByRole('button', { name: 'Remove winner 2' }));
  await context.user.click(screen.getByRole('button', { name: correction ? 'Save correction' : 'Save draft' })); expect(screen.getByRole('alert').textContent).toContain('fresh reason'); expect(context.writes()).toHaveLength(0);
  await enableOverride(context, 'Signed sheet removes the shared winner'); const dialog = await openOverride(context); expect(dialog.getByText(/removes the existing shared-position approval/)).toBeTruthy();
  await context.user.click(dialog.getByRole('button', { name: 'Confirm override' })); await screen.findByText(/Shared-position changes saved privately/);
  expect(context.writes()[0][0]).toMatch(correction ? /\/result\/corrections\/200\/shared-positions$/ : /\/result-draft\/shared-positions$/);
  const entries = correction ? context.correction()!.entries : context.live().entries; expect(entries.every((entry) => entry.override_audit_id === null)).toBe(true);
  await context.user.click(screen.getByRole('button', { name: correction ? 'Save correction' : 'Save draft' })); await screen.findByText(correction ? 'Correction saved privately.' : 'Draft saved.');
  expect(context.writes()[1][0]).toMatch(correction ? /\/corrections\/200$/ : /\/result-draft$/); expect(JSON.parse(String(context.writes()[1][1].body))).not.toHaveProperty('shared_positions'); expect(context.published()).toEqual(oldPublic);
});

test('a shared save cannot be requested for an ordinary unique set', async () => {
  const context = setup({ path: detail }); await enableOverride(context); await context.user.click(screen.getByRole('button', { name: 'Save shared-position override' }));
  expect(screen.getByRole('alert').textContent).toContain('No shared positions or existing override'); expect(screen.queryByRole('dialog')).toBeNull(); expect(context.writes()).toHaveLength(0);
});

test('duplicate candidates stay blocked with sharing enabled and exact registered candidate lookup is reused', async () => {
  const context = setup({ path: detail }); await enableOverride(context); await context.user.click(screen.getByRole('button', { name: 'Add winner' }));
  const row = within(screen.getByRole('group', { name: 'Winner 3' })); await context.user.type(row.getByLabelText('External candidate ID'), '001'); await context.user.click(row.getByRole('button', { name: 'Look up candidate' }));
  await row.findByText(/Existing candidate/); expect((row.getByLabelText('Candidate name') as HTMLInputElement).value).toBe('First winner'); expect((row.getByLabelText('Candidate name') as HTMLInputElement).readOnly).toBe(true);
  await context.user.click(screen.getByRole('button', { name: 'Save shared-position override' })); expect(screen.getByRole('alert').textContent).toContain('Duplicate candidate IDs'); expect(context.writes()).toHaveLength(0);
});

test.each([400, 409, 503, 'network'] as const)('failed override %s preserves winners/reason and never falls back to ordinary saving', async (status) => {
  const context = setup({ status: 'published', existingCorrection: 'draft', path: `${detail}&correction=200&resultView=correction`, override: async (path, options) => {
    if (!path.endsWith('/shared-positions') || options.method !== 'PUT') return undefined;
    if (status === 'network') throw new Error('Private transport detail');
    return reply({ error: status === 409 ? 'Result changed; retrieve the latest version before retrying' : 'Override could not be saved' }, status);
  } });
  const original = context.correction(); const published = context.published(); await enableOverride(context); await addSharedWinner(context); await openOverride(context); await context.user.click(screen.getByRole('button', { name: 'Confirm override' }));
  await within(screen.getByRole('dialog')).findByRole('alert'); expect(context.correction()).toEqual(original); expect(context.published()).toEqual(published); expect(context.writes()).toHaveLength(1);
  expect(document.body.textContent).not.toContain('Private transport detail');
  if (status === 409) expect(screen.getByRole('button', { name: 'Confirm override' }).matches(':disabled')).toBe(true);
  await context.user.click(screen.getByRole('button', { name: 'Cancel override' })); expect((screen.getByLabelText('Shared-position override reason') as HTMLTextAreaElement).value).toBe(tieReason); expect(screen.getByDisplayValue('0009')).toBeTruthy();
  if (status === 409) {
    vi.spyOn(window, 'confirm').mockReturnValue(false); await context.user.click(screen.getByRole('button', { name: 'Reload correction' })); expect(screen.getByDisplayValue('0009')).toBeTruthy();
    vi.mocked(window.confirm).mockReturnValue(true); await context.user.click(screen.getByRole('button', { name: 'Reload correction' })); await screen.findByRole('checkbox', { name: 'Allow Shared Positions' }); expect(screen.queryByDisplayValue('0009')).toBeNull();
  }
});

test('shared override pending writes prevent duplicate submissions and do not claim early success', async () => {
  let release!: () => void;
  const context = setup({ path: detail, override: async (path, options) => path.endsWith('/shared-positions') && options.method === 'PUT' ? new Promise((resolve) => { release = () => resolve(undefined); }) : undefined });
  await enableOverride(context); await addSharedWinner(context); await openOverride(context); await context.user.dblClick(screen.getByRole('button', { name: 'Confirm override' }));
  await waitFor(() => expect(context.writes()).toHaveLength(1)); expect(screen.queryByText(/Shared-position changes saved privately/)).toBeNull(); expect(screen.getByRole('button', { name: 'Cancel override' }).matches(':disabled')).toBe(true);
  await context.user.keyboard('{Escape}{Tab}'); expect(screen.getByRole('dialog')).toBeTruthy(); expect(document.activeElement).toBe(screen.getByRole('dialog'));
  await act(async () => release()); await screen.findByText(/Shared-position changes saved privately/); expect(context.live().entries).toHaveLength(3);
});

test('override option/reason and confirmation retain navigation and unload safeguards', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false); const context = setup({ path: detail }); await enableOverride(context); await addSharedWinner(context); await openOverride(context);
  const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
  await act(async () => { await routers.at(-1)!.navigate(-1); }); expect(confirm).toHaveBeenCalled(); expect(screen.getByRole('dialog')).toBeTruthy(); expect(context.writes()).toHaveLength(0);
  await context.user.click(screen.getByRole('button', { name: 'Cancel override' })); await context.user.click(screen.getByRole('link', { name: 'Review saved result' })); expect(screen.getByDisplayValue(tieReason)).toBeTruthy();
});

test.each([401, 403])('shared-position API authorization %s removes protected forms', async (status) => {
  const context = setup({ path: detail, override: async (path, options) => path.endsWith('/shared-positions') && options.method === 'PUT' ? reply({}, status) : undefined });
  await enableOverride(context); await addSharedWinner(context); await openOverride(context); await context.user.click(screen.getByRole('button', { name: 'Confirm override' }));
  await screen.findByRole('heading', { name: status === 401 ? 'Sign in' : 'Access denied' }); expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.queryByRole('checkbox', { name: 'Allow Shared Positions' })).toBeNull();
});

test('ordinary publication followed by a shared correction preserves the public snapshot until confirmed replacement', async () => {
  const context = setup({ path: detail }); await context.user.click(await screen.findByRole('button', { name: 'Save draft' })); await screen.findByText('Draft saved.');
  await context.user.click(screen.getByRole('link', { name: 'Review saved result' })); await context.user.click(await screen.findByRole('button', { name: 'Review result' })); await screen.findByText('Result reviewed.');
  await context.user.click(screen.getByRole('button', { name: 'Publish result' })); await context.user.click(screen.getByRole('button', { name: 'Confirm publication' })); await screen.findByRole('region', { name: 'Current public result' }); const previous = context.published();
  await context.user.type(screen.getByLabelText('Correction reason'), 'Reconcile signed winner sheet'); await context.user.click(screen.getByRole('button', { name: 'Start correction' }));
  await enableOverride(context); await addSharedWinner(context); const version = context.correction()!.version; await openOverride(context); await context.user.click(screen.getByRole('button', { name: 'Confirm override' })); await screen.findByText(/Shared-position changes saved privately/);
  const sharedWrite = context.writes().find(([path]) => String(path).endsWith('/shared-positions'))!; expect(sharedWrite[0]).toMatch(/\/corrections\/200\/shared-positions$/); expect(JSON.parse(String(sharedWrite[1].body)).version).toBe(version); expect(context.published()).toEqual(previous);
  await context.user.click(screen.getByRole('link', { name: 'Review saved correction' })); expect(await screen.findByText('Shared position 1')).toBeTruthy(); await context.user.click(screen.getByRole('button', { name: 'Review correction' })); await screen.findByText('Correction reviewed.'); expect(context.published()).toEqual(previous);
  await context.user.click(screen.getByRole('button', { name: 'Publish correction' })); expect(within(screen.getByRole('dialog')).getByText('Shared position 1')).toBeTruthy(); await context.user.click(screen.getByRole('button', { name: 'Confirm publication' }));
  await waitFor(() => expect(within(screen.getByRole('region', { name: 'Current public result' })).getByText('Position 1: Additional shared winner')).toBeTruthy());
  expect(context.published()!.winners.map((winner) => winner.position)).toEqual([1, 7, 1]); expect(context.history).toHaveLength(2); expect(context.history[0]).toEqual(previous);
  expect(JSON.stringify(context.published())).not.toMatch(/reason|override|audit|reviewed_by/); expect(context.writes().some(([path]) => String(path).includes('/candidates'))).toBe(false);
});

test('unchanged inherited published ties can review without new override while edits remain explicit', async () => {
  const context = setup({ status: 'published', entries: tiedWinners(), existingCorrection: 'draft', path: `${detail}&correction=200&resultView=correction` });
  expect((await screen.findByRole('checkbox', { name: 'Allow Shared Positions' }) as HTMLInputElement).checked).toBe(false);
  await context.user.click(screen.getByRole('link', { name: 'Review saved correction' })); await context.user.click(await screen.findByRole('button', { name: 'Review correction' })); await screen.findByText('Correction reviewed.');
  expect(context.writes()).toHaveLength(1); expect(context.writes()[0][0]).toMatch(/\/corrections\/200\/review$/); expect(context.published()!.winners).toHaveLength(3);
});

test.each(['draft', 'correction'])('adding and removing a member of an existing %s tie require fresh explicit approvals', async (kind) => {
  const correction = kind === 'correction';
  const context = setup({ status: correction ? 'published' : 'draft', entries: tiedWinners(), existingCorrection: correction ? 'draft' : undefined, path: correction ? `${detail}&correction=200&resultView=correction` : detail });
  await enableOverride(context); await addSharedWinner(context); const oldVersion = correction ? context.correction()!.version : context.live().version;
  await openOverride(context); await context.user.click(screen.getByRole('button', { name: 'Confirm override' })); await screen.findByText(/Shared-position changes saved privately/);
  expect(JSON.parse(String(context.writes()[0][1].body)).version).toBe(oldVersion);
  expect((correction ? context.correction()!.entries : context.live().entries).filter((entry) => entry.position === 1)).toHaveLength(3);
  await context.user.click(screen.getByRole('button', { name: 'Remove winner 4' })); await enableOverride(context, 'Signed sheet removes the additional shared winner');
  await openOverride(context); await context.user.click(screen.getByRole('button', { name: 'Confirm override' })); await screen.findByText(/Shared-position changes saved privately/);
  expect(context.writes()).toHaveLength(2); expect(context.writes().every(([path]) => String(path).endsWith('/shared-positions'))).toBe(true);
  const body = JSON.parse(String(context.writes()[1][1].body)); expect(body.version).not.toBe(oldVersion); expect(body.reason).toContain('removes'); expect(body.entries.filter((entry: WinnerPayload) => entry.position === 1)).toHaveLength(2);
});

test('a delayed shared save cannot show success or private winners in another competition', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true); let release!: () => void;
  const context = setup({ path: detail, override: async (path, options) => path.endsWith('/shared-positions') && options.method === 'PUT' ? new Promise((resolve) => { release = () => resolve(undefined); }) : undefined });
  await enableOverride(context); await addSharedWinner(context); await openOverride(context); await context.user.click(screen.getByRole('button', { name: 'Confirm override' })); await waitFor(() => expect(context.writes()).toHaveLength(1));
  await act(async () => { await routers.at(-1)!.navigate('/admin/results?competition=2'); }); await screen.findByText('No events in this category.'); await act(async () => release());
  expect(screen.queryByText(/Shared-position changes saved privately/)).toBeNull(); expect(screen.queryByDisplayValue('0009')).toBeNull(); expect(screen.getByTestId('location').textContent).toBe('/admin/results?competition=2');
});
