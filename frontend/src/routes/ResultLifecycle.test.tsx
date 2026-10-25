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
    if (path.includes('/candidates/lookup')) return reply({ error: 'Candidate not found' }, 404);
    if (path.startsWith('/api/competitions/') && path.endsWith('/result')) return published ? reply({ result: published }) : reply({ error: 'Published result not found' }, 404);
    if (path.endsWith('/result-draft')) return live.status === 'draft' ? reply({ draft: live }) : reply({ error: 'Only draft results can be managed through this endpoint' }, 409);
    const root = '/api/admin/competitions/1/categories/11/events/111/result';
    if (path === root && method === 'GET') return reply({ result: { ...live, active_correction_id: active() } });
    const body = options.body ? JSON.parse(String(options.body)) : {};
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
      correction = { ...correction!, version: nextVersion(), entries: body.entries.map((entry: WinnerPayload, index: number) => ({ ...entry, id: String(601 + index), candidate_id: String(201 + index), unit_name: entry.unit_id === '21' ? 'North Unit' : 'South Unit', madrasa_name: entry.madrasa_id ? 'Central Madrassa' : null, override_audit_id: null })) };
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
