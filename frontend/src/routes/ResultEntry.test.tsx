import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../App';
import type { AuthClient, AuthUser } from '../types/auth';
import type { Candidate, ResultDraft, ResultStatus, WinnerPayload } from '../types/adminResults';

const routers: ReturnType<typeof createMemoryRouter>[] = [];
beforeAll(async () => { await import('../pages/admin/AdminResults'); });
afterEach(() => { cleanup(); routers.splice(0).forEach((router) => router.dispose()); });
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const candidate = (code = '001'): Candidate => ({ id: '101', competition_id: '1', category_id: '11', candidate_code: code, name: 'Registered winner', unit_id: '21', madrasa_id: '31' });
const savedDraft = (entries: ResultDraft['entries'] = []): ResultDraft => ({ id: '100', competition_id: '1', category_id: '11', event_id: '111', status: 'draft', version: '123:20261025000000.000001', updated_at: '2026-10-25T00:00:00Z', entries });
const savedEntry = () => ({ id: '501', candidate_id: '101', candidate_code: '001', name: 'Registered winner', unit_id: '21', madrasa_id: '31', position: 1, override_audit_id: null });
function Probe() {
  const location = useLocation(); const navigate = useNavigate();
  return <><output data-testid="location">{location.pathname + location.search}</output><button onClick={() => void navigate(-1)}>Back</button><button onClick={() => void navigate(1)}>Forward</button></>;
}
const detail = '/admin/results?competition=1&category=11&event=111';
function setup({ path = detail, initialEntries, draft: initialDraft = savedDraft(), points = { '1': 5, '7': 0, '12': 2 }, empty = false, signedIn = true, override }: {
  path?: string; initialEntries?: string[]; draft?: ResultDraft | null; points?: Record<string, number>; empty?: boolean; signedIn?: boolean;
  override?: (path: string, options: RequestInit) => Promise<Response | undefined>;
} = {}) {
  let draft = initialDraft; let version = 123;
  const statuses: ResultStatus[] = [
    { event_id: '111', category_id: '11', event_name: 'Recital', event_result_id: draft ? '100' : null, status: draft ? 'draft' : 'not_started', updated_at: null },
    { event_id: '112', category_id: '11', event_name: 'Awaiting event', event_result_id: null, status: 'not_started', updated_at: null },
    { event_id: '113', category_id: '11', event_name: 'Reviewed event', event_result_id: '102', status: 'reviewed', updated_at: null },
    { event_id: '114', category_id: '11', event_name: 'Published event', event_result_id: '103', status: 'published', updated_at: null },
  ];
  const currentUser: AuthUser = { uid: 'admin', email: 'admin@example.test', getIdToken: vi.fn(async (refresh) => refresh ? 'fresh' : 'opaque') };
  let listener: (user: AuthUser | null) => void;
  const client: AuthClient = { subscribe: (fn) => { listener = fn; queueMicrotask(() => fn(signedIn ? currentUser : null)); return () => {}; }, signIn: vi.fn(async () => {}), signOut: vi.fn(async () => listener(null)) };
  const fetcher = vi.fn(async (url: string | URL | Request, options: RequestInit = {}) => {
    const path = String(url); const method = options.method ?? 'GET';
    if (path === '/api/admin/me') return reply({ uid: 'admin', email: currentUser.email, emailVerified: true, admin: true });
    const custom = await override?.(path, options); if (custom) return custom;
    if (path === '/api/admin/competitions') return reply({ competitions: [{ id: '1', name: 'First competition', code: 'C1', status: 'active' }, { id: '2', name: 'Second competition', code: 'C2', status: 'archived' }] });
    const competitionId = path.split('/')[4];
    if (path.endsWith('/categories')) return reply({ categories: empty ? [] : [{ id: '12', competition_id: competitionId, name: 'First category', sort_order: 0 }, { id: '11', competition_id: competitionId, name: 'Entry category', sort_order: 10 }] });
    if (path.endsWith('/result-statuses')) return reply({ results: empty || competitionId === '2' ? [] : statuses });
    if (path.endsWith('/settings')) return reply({ settings: { competition_id: competitionId, position_points: points } });
    if (path.endsWith('/units')) return reply({ units: [{ id: '21', competition_id: competitionId, name: 'North Unit' }, { id: '22', competition_id: competitionId, name: 'South Unit' }] });
    if (path.endsWith('/madrasas')) return reply({ madrasas: path.includes('/units/21/') ? [{ id: '31', competition_id: competitionId, unit_id: '21', name: 'Registered Madrassa' }] : [] });
    if (/\/categories\/11$/.test(path)) return reply({ category: { id: '11', competition_id: competitionId, name: 'Entry category', sort_order: 10 } });
    if (/\/events\/[0-9]+$/.test(path)) return reply({ event: { id: path.split('/')[8], competition_id: competitionId, category_id: '11', name: 'Event', sort_order: 0 } });
    if (path.endsWith('/result')) {
      if (path.startsWith('/api/competitions/')) return reply({ result: { competition_id: '1', category_id: '11', event_id: path.split('/')[7], event_name: 'Event', category_name: 'Entry category', publication_id: '99', published_at: '2026-10-25T00:00:00Z', winners: [] } });
      const eventId = path.split('/')[8]; const status = statuses.find((row) => row.event_id === eventId)?.status;
      return reply({ result: { ...savedDraft(), event_id: eventId, status, reviewed_by: 'admin', reviewed_at: '2026-10-25T00:00:00Z', published_by: status === 'published' ? 'admin' : null, published_at: status === 'published' ? '2026-10-25T00:00:00Z' : null, active_correction_id: null, entries: [] } });
    }
    if (path.includes('/candidates/lookup')) {
      const code = new URL(path, 'http://local').searchParams.get('candidate_code');
      return code === '001' ? reply({ candidate: candidate() }) : reply({ error: 'Candidate not found' }, 404);
    }
    if (path.endsWith('/result-draft')) {
      if (method === 'POST') { draft ??= savedDraft(); statuses[0] = { ...statuses[0], status: 'draft', event_result_id: '100' }; return reply({ draft }, 201); }
      if (method === 'PUT') {
        const body = JSON.parse(String(options.body));
        if (!draft || body.version !== draft.version) return reply({ error: 'Draft changed; retrieve the latest version before saving' }, 409);
        draft = { ...draft, version: `${++version}:20261025000000.000001`, entries: body.entries.map((entry: WinnerPayload, index: number) => ({ ...entry, id: String(501 + index), candidate_id: String(101 + index), override_audit_id: null })) };
        return reply({ draft });
      }
      return draft ? reply({ draft }) : reply({ error: 'Result draft not found' }, 404);
    }
    if (path === '/api/competitions') return reply({ competitions: [] });
    return reply({ error: 'Not found' }, 404);
  });
  const router = createMemoryRouter([{ path: '*', element: <><AppRoutes client={client} fetcher={fetcher as typeof fetch} /><Probe /></> }], { initialEntries: initialEntries ?? [path] }); routers.push(router);
  render(<RouterProvider router={router} />);
  return { user: userEvent.setup(), fetcher, router, client, currentUser, writes: () => fetcher.mock.calls.map(([path, options = {}]) => [path, options] as const).filter(([, options]) => options.method && options.method !== 'GET') };
}
async function add(user: ReturnType<typeof userEvent.setup>, code = '001') {
  await user.click(await screen.findByRole('button', { name: 'Add winner' }));
  const rows = screen.getAllByRole('group', { name: /^Winner \d/ }); const row = within(rows[rows.length - 1]);
  await user.type(row.getByLabelText('External candidate ID'), code); return row;
}
async function newWinner(user: ReturnType<typeof userEvent.setup>, code = '007') {
  const row = await add(user, code); await user.click(row.getByRole('button', { name: 'Look up candidate' })); await row.findByText(/New candidate/);
  await user.type(row.getByLabelText('Candidate name'), 'New winner'); await user.selectOptions(row.getByLabelText('Unit'), '21');
  await waitFor(() => expect(row.getByLabelText('Madrassa (optional)').matches(':disabled')).toBe(false)); return row;
}

test('result categories/events follow backend order and show all four statuses', async () => {
  setup({ path: '/admin/results?competition=1' });
  await screen.findByRole('link', { name: 'Recital Draft' });
  const categories = within(screen.getByRole('navigation', { name: 'Result categories' })).getAllByRole('link');
  expect(categories.map((item) => item.textContent)).toEqual(['All categories', 'First category', 'Entry category']);
  expect(screen.getByText('No events in this category.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Awaiting event Awaiting' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Reviewed event Reviewed' })).toBeTruthy(); expect(screen.getByRole('link', { name: 'Published event Published' })).toBeTruthy();
});

test('empty competition and missing selection do not offer entry forms', async () => {
  setup({ empty: true, path: '/admin/results?competition=1' }); await screen.findByRole('heading', { name: 'No categories yet' }); cleanup();
  const { fetcher } = setup({ path: '/admin/results' }); await screen.findByText('Select a competition above to manage result drafts.'); expect(fetcher).toHaveBeenCalledTimes(2);
});

test('missing drafts are initialized explicitly and initialization never publishes', async () => {
  const { user, writes } = setup({ draft: null }); await screen.findByRole('button', { name: 'Initialize draft' }); expect(writes()).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'Initialize draft' })); await screen.findByRole('button', { name: 'Save draft' });
  expect(writes()[0][1]).toEqual(expect.objectContaining({ method: 'POST', body: '{}' }));
  expect(screen.getByRole('link', { name: 'Recital Draft' })).toBeTruthy();
});

test('existing candidate lookup preserves leading zeros, populates affiliations and configured positions', async () => {
  const { user, writes, fetcher } = setup(); const row = await add(user); await user.click(row.getByRole('button', { name: 'Look up candidate' }));
  await row.findByText(/Existing candidate/);
  expect((row.getByLabelText('Candidate name') as HTMLInputElement).value).toBe('Registered winner'); expect(row.getByLabelText('Candidate name').hasAttribute('readonly')).toBe(true);
  expect((row.getByLabelText('Unit') as HTMLSelectElement).value).toBe('21'); expect((row.getByLabelText('Madrassa (optional)') as HTMLSelectElement).value).toBe('31');
  expect(within(row.getByLabelText('Winning position')).getAllByRole('option').map((item) => (item as HTMLOptionElement).value)).toEqual(['', '1', '7', '12']);
  await user.selectOptions(row.getByLabelText('Winning position'), '7'); await user.click(screen.getByRole('button', { name: 'Save draft' })); await screen.findByText('Draft saved.');
  const body = JSON.parse(String(writes()[0][1].body)); expect(body).toEqual({ version: '123:20261025000000.000001', entries: [{ candidate_code: '001', name: 'Registered winner', unit_id: '21', madrasa_id: '31', position: 7 }] });
  expect(fetcher).toHaveBeenCalledWith('/api/admin/competitions/1/candidates/lookup?candidate_code=001', expect.anything());
});

test('new candidates are created only through a complete draft PUT and optional Madrassas remain null', async () => {
  const { user, writes } = setup(); await newWinner(user); expect(writes()).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'Save draft' })); await screen.findByText('Draft saved.');
  expect(writes()).toHaveLength(1); expect(writes()[0][1].method).toBe('PUT'); expect(JSON.parse(String(writes()[0][1].body)).entries[0]).toEqual({ candidate_code: '007', name: 'New winner', unit_id: '21', madrasa_id: null, position: 1 });
});

test('unit changes clear the old Madrassa and restrict options to the selected unit', async () => {
  const { user } = setup(); const row = await newWinner(user); await user.selectOptions(row.getByLabelText('Madrassa (optional)'), '31'); await user.selectOptions(row.getByLabelText('Unit'), '22');
  await waitFor(() => expect(row.getByLabelText('Madrassa (optional)').matches(':disabled')).toBe(false));
  expect((row.getByLabelText('Madrassa (optional)') as HTMLSelectElement).value).toBe(''); expect(within(row.getByLabelText('Madrassa (optional)')).queryByRole('option', { name: 'Registered Madrassa' })).toBeNull();
});

test('identity differences are surfaced before explicitly choosing registered candidate data', async () => {
  const { user, writes } = setup(); const row = await add(user); await user.type(row.getByLabelText('Candidate name'), 'Different identity');
  await user.click(row.getByRole('button', { name: 'Look up candidate' })); await row.findByRole('button', { name: 'Use registered candidate' });
  expect((row.getByLabelText('Candidate name') as HTMLInputElement).value).toBe('Different identity');
  await user.click(screen.getByRole('button', { name: 'Save draft' })); expect(await screen.findByText(/Winner 1: resolve the candidate/)).toBeTruthy(); expect(writes()).toHaveLength(0);
  await user.click(row.getByRole('button', { name: 'Use registered candidate' })); expect((row.getByLabelText('Candidate name') as HTMLInputElement).value).toBe('Registered winner');
});

test('a candidate from another category cannot be entered or reassigned', async () => {
  const { user, writes } = setup({ override: async (path) => path.includes('/lookup') ? reply({ candidate: { ...candidate(), category_id: '12' } }) : undefined });
  const row = await add(user); await user.click(row.getByRole('button', { name: 'Look up candidate' })); await row.findByText(/belongs to another category/);
  expect(row.queryByRole('button', { name: 'Use registered candidate' })).toBeNull(); await user.click(screen.getByRole('button', { name: 'Save draft' })); expect(writes()).toHaveLength(0);
});

test('existing drafts load identity values, allow replacement/removal, and advance the exact server version', async () => {
  const { user, writes } = setup({ draft: savedDraft([savedEntry()]) }); await screen.findByLabelText('External candidate ID');
  expect((screen.getByLabelText('External candidate ID') as HTMLInputElement).value).toBe('001');
  await user.clear(screen.getByLabelText('External candidate ID')); await user.type(screen.getByLabelText('External candidate ID'), '0009'); await user.click(screen.getByRole('button', { name: 'Look up candidate' })); await screen.findByText(/New candidate/);
  await user.type(screen.getByLabelText('Candidate name'), 'Replacement'); await user.selectOptions(screen.getByLabelText('Unit'), '22'); await user.click(screen.getByRole('button', { name: 'Save draft' })); await screen.findByText('Draft saved.');
  expect(JSON.parse(String(writes()[0][1].body)).entries[0].candidate_code).toBe('0009');
  await user.click(screen.getByRole('button', { name: 'Remove winner 1' })); await user.click(screen.getByRole('button', { name: 'Save draft' })); await screen.findByText('Draft saved.');
  expect(JSON.parse(String(writes()[1][1].body))).toEqual({ version: '124:20261025000000.000001', entries: [] });
});

test('empty drafts can be saved with no configured positions; incomplete drafts are permitted', async () => {
  const { user, writes } = setup({ points: {} }); await screen.findByRole('button', { name: 'Save draft' }); expect(screen.getByRole('button', { name: 'Add winner' }).matches(':disabled')).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Save draft' })); await screen.findByText('Draft saved.'); expect(JSON.parse(String(writes()[0][1].body)).entries).toEqual([]);
});

test('duplicate positions and exact candidate codes are rejected before transport', async () => {
  const { user, writes } = setup(); const first = await newWinner(user, '007'); const second = await newWinner(user, '008');
  await user.selectOptions(second.getByLabelText('Winning position'), '1'); await user.click(screen.getByRole('button', { name: 'Save draft' })); expect((await screen.findByRole('alert')).textContent).toContain('Duplicate positions');
  await user.selectOptions(second.getByLabelText('Winning position'), '7');
  await user.clear(second.getByLabelText('External candidate ID')); await user.type(second.getByLabelText('External candidate ID'), '007');
  await user.click(screen.getByRole('button', { name: 'Save draft' })); expect((await screen.findByRole('alert')).textContent).toContain('Duplicate candidate'); expect(writes()).toHaveLength(0); expect((first.getByLabelText('External candidate ID') as HTMLInputElement).value).toBe('007');
});

test('version conflicts retain edits, disable blind retry and require explicit confirmed reload', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { user, writes } = setup({ override: async (_path, options) => options.method === 'PUT' ? reply({ error: 'Draft changed; retrieve the latest version before saving' }, 409) : undefined });
  await newWinner(user); await user.click(screen.getByRole('button', { name: 'Save draft' })); await screen.findByText(/Draft changed;/);
  expect((screen.getByLabelText('Candidate name') as HTMLInputElement).value).toBe('New winner'); expect(screen.getByRole('button', { name: 'Save draft' }).matches(':disabled')).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Reload draft' })); expect(screen.getByLabelText('Candidate name')).toBeTruthy(); expect(writes()).toHaveLength(1);
  confirm.mockReturnValue(true); await user.click(screen.getByRole('button', { name: 'Reload draft' })); await screen.findByText('No winners entered.');
});

test.each(['Reviewed', 'Published'])('%s events show protection without requesting draft endpoints', async (status) => {
  const { user, fetcher } = setup({ path: '/admin/results?competition=1' }); await user.click(await screen.findByRole('link', { name: `${status} event ${status}` }));
  await screen.findByRole('region', { name: status === 'Reviewed' ? 'Result review' : 'Current public result' }); expect(fetcher.mock.calls.some(([path]) => String(path).endsWith('/result-draft'))).toBe(false);
});

test('shared-position drafts are protected from ordinary saving', async () => {
  const context = setup({ draft: savedDraft([{ ...savedEntry(), override_audit_id: '9' }]) });
  await context.user.click(await screen.findByRole('button', { name: 'Save draft' }));
  expect((await screen.findByRole('alert')).textContent).toContain('fresh reason'); expect(context.writes()).toHaveLength(0);
});

test('saving uses a submission latch and claims success only after the server responds', async () => {
  let done!: (response: Response) => void;
  const { user, writes } = setup({ override: async (_path, options) => options.method === 'PUT' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await user.dblClick(await screen.findByRole('button', { name: 'Save draft' })); await waitFor(() => expect(writes()).toHaveLength(1)); expect(screen.queryByText('Draft saved.')).toBeNull();
  fireEvent.submit(screen.getByRole('form', { name: 'Event result draft' })); expect(writes()).toHaveLength(1);
  await act(async () => done(reply({ draft: savedDraft() }))); await screen.findByText('Draft saved.');
});

test('Back/Forward, internal links, competition switches, logout and unload protect dirty drafts', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { user, client } = setup({ initialEntries: ['/admin/results?competition=1', detail] }); await add(user, '007');
  await user.click(screen.getByRole('button', { name: 'Back' })); expect(screen.getByLabelText('External candidate ID')).toBeTruthy(); expect(screen.getByTestId('location').textContent).toBe(detail);
  await user.click(screen.getByRole('link', { name: 'Dashboard' })); await user.selectOptions(screen.getByLabelText('Competition'), '2'); await user.click(screen.getByRole('button', { name: 'Sign out' })); expect(client.signOut).not.toHaveBeenCalled();
  const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true); expect(confirm).toHaveBeenCalledTimes(4);
  confirm.mockReturnValue(true); await user.click(screen.getByRole('button', { name: 'Back' })); await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/admin/results?competition=1'));
  await user.click(screen.getByRole('button', { name: 'Forward' })); await screen.findByRole('button', { name: 'Add winner' });
});

test('concurrent lookups preserve edits and positions in every row', async () => {
  let done!: (response: Response) => void;
  const { user } = setup({ override: async (path) => path.includes('candidate_code=001') ? new Promise((resolve) => { done = resolve; }) : undefined });
  const first = await add(user); await user.click(first.getByRole('button', { name: 'Look up candidate' })); const second = await newWinner(user, '008'); await user.selectOptions(first.getByLabelText('Winning position'), '12');
  await act(async () => done(reply({ candidate: candidate() })));
  expect((first.getByLabelText('Winning position') as HTMLSelectElement).value).toBe('12'); expect((second.getByLabelText('Candidate name') as HTMLInputElement).value).toBe('New winner');
});

test('expired or denied draft requests remove protected content', async () => {
  const { user } = setup({ override: async (_path, options) => options.method === 'PUT' ? reply({}, 403) : undefined });
  await user.click(await screen.findByRole('button', { name: 'Save draft' })); await screen.findByRole('heading', { name: 'Access denied' }); expect(screen.queryByRole('form')).toBeNull();
});

test('signed-out result deep links never request admin data, and public routes stay independent', async () => {
  const { fetcher } = setup({ signedIn: false }); await screen.findByRole('heading', { name: 'Sign in' }); expect(fetcher).not.toHaveBeenCalled(); cleanup();
  const publicApp = setup({ path: '/', signedIn: false }); await screen.findByRole('heading', { name: 'No active competition' }); expect(publicApp.fetcher).toHaveBeenCalledTimes(1);
});

test('status and draft option errors expose retry without creating or resetting drafts', async () => {
  let fail = true;
  const { user, writes } = setup({ override: async (path) => fail && path.endsWith('/result-statuses') ? reply({}, 500) : undefined });
  await screen.findByRole('alert'); expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull(); fail = false;
  await user.click(screen.getByRole('button', { name: 'Try again' })); await screen.findByRole('button', { name: 'Save draft' }); expect(writes()).toHaveLength(0);
});

test('draft GET failures are retryable and never become an empty editable draft', async () => {
  let fail = true;
  const { user, writes } = setup({ override: async (path, options) => fail && path.endsWith('/result-draft') && !options.method ? reply({}, 503) : undefined });
  await screen.findByRole('alert'); expect(screen.queryByRole('button', { name: 'Initialize draft' })).toBeNull(); fail = false;
  await user.click(screen.getByRole('button', { name: 'Try again' })); await screen.findByRole('button', { name: 'Save draft' }); expect(writes()).toHaveLength(0);
});

test('a lifecycle change after the status read locks draft entry without resetting results', async () => {
  setup({ override: async (path) => path.endsWith('/result-draft') ? reply({ error: 'Only draft results can be managed through this endpoint' }, 409) : undefined });
  await screen.findByRole('heading', { name: 'Draft editing unavailable' }); expect(screen.queryByRole('button', { name: 'Initialize draft' })).toBeNull();
});

test('lookup failures preserve entry values and allow retry; missing parents are not new candidates', async () => {
  let fail = true;
  const { user } = setup({ override: async (path) => fail && path.includes('/lookup') ? reply({ error: 'Competition not found' }, 404) : undefined });
  const row = await add(user); await user.type(row.getByLabelText('Candidate name'), 'Entered name'); await user.click(row.getByRole('button', { name: 'Look up candidate' }));
  await row.findByRole('alert'); expect(row.queryByText(/New candidate/)).toBeNull(); expect((row.getByLabelText('Candidate name') as HTMLInputElement).value).toBe('Entered name');
  fail = false; await user.click(row.getByRole('button', { name: 'Look up candidate' })); await row.findByRole('button', { name: 'Use registered candidate' });
});

test('a late lookup cannot populate a different external code', async () => {
  let done!: (response: Response) => void;
  const { user } = setup({ override: async (path) => path.includes('candidate_code=001') ? new Promise((resolve) => { done = resolve; }) : undefined });
  const row = await add(user); await user.click(row.getByRole('button', { name: 'Look up candidate' })); await waitFor(() => expect(done).toBeTypeOf('function'));
  await user.clear(row.getByLabelText('External candidate ID')); await user.type(row.getByLabelText('External candidate ID'), '0002');
  await act(async () => done(reply({ candidate: candidate() })));
  expect((row.getByLabelText('External candidate ID') as HTMLInputElement).value).toBe('0002'); expect((row.getByLabelText('Candidate name') as HTMLInputElement).value).toBe('');
});

test('background auth checks and unrelated renders preserve winner edits', async () => {
  const { user } = setup(); const row = await newWinner(user); await act(async () => { window.dispatchEvent(new Event('focus')); });
  expect((row.getByLabelText('Candidate name') as HTMLInputElement).value).toBe('New winner');
  await user.click(screen.getByRole('button', { name: 'Menu' })); expect((row.getByLabelText('External candidate ID') as HTMLInputElement).value).toBe('007');
});

test('late save responses cannot change another selected event', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true); let done!: (response: Response) => void;
  const { user } = setup({ override: async (_path, options) => options.method === 'PUT' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await user.click(await screen.findByRole('button', { name: 'Save draft' })); await waitFor(() => expect(done).toBeTypeOf('function'));
  await user.click(screen.getByRole('link', { name: 'Reviewed event Reviewed' })); await screen.findByRole('region', { name: 'Result review' });
  await act(async () => done(reply({ draft: savedDraft() }))); expect(screen.queryByText('Draft saved.')).toBeNull(); expect(screen.getByTestId('location').textContent).toContain('event=113');
});

test('network and server validation failures retain winner entries with safe feedback', async () => {
  const { user } = setup({ override: async (_path, options) => options.method === 'PUT' ? reply({ error: 'Candidate identity conflicts with the existing record' }, 409) : undefined });
  await newWinner(user); await user.click(screen.getByRole('button', { name: 'Save draft' })); await screen.findByText('Candidate identity conflicts with the existing record');
  expect((screen.getByLabelText('Candidate name') as HTMLInputElement).value).toBe('New winner'); expect(screen.getByRole('button', { name: 'Save draft' }).matches(':disabled')).toBe(false);
});

test('lookup and draft requests enforce competition/category/event isolation on malformed successful responses', async () => {
  const { user } = setup({ override: async (path) => path.includes('/lookup') ? reply({ candidate: { ...candidate(), competition_id: '2' } }) : undefined });
  const row = await add(user); await user.click(row.getByRole('button', { name: 'Look up candidate' })); await row.findByRole('alert'); expect(row.queryByText(/Existing candidate/)).toBeNull();
});

test('late result status responses cannot overwrite another competition', async () => {
  let done!: (response: Response) => void;
  const { user } = setup({ path: '/admin/results?competition=1', override: async (path) => path === '/api/admin/competitions/1/result-statuses' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await screen.findByText('Loading result statuses…'); await waitFor(() => expect(done).toBeTypeOf('function'));
  await user.selectOptions(screen.getByLabelText('Competition'), '2'); await screen.findAllByText('No events in this category.');
  await act(async () => done(reply({ results: [{ event_id: '111', category_id: '11', event_name: 'Stale private event', event_result_id: null, status: 'not_started', updated_at: null }] })));
  expect(screen.queryByText('Stale private event')).toBeNull();
});

test('pending initialization cannot be submitted twice', async () => {
  let done!: (response: Response) => void;
  const { user, writes } = setup({ draft: null, override: async (_path, options) => options.method === 'POST' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await user.dblClick(await screen.findByRole('button', { name: 'Initialize draft' })); await waitFor(() => expect(writes()).toHaveLength(1)); expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
  await act(async () => done(reply({ draft: savedDraft() }, 201))); await screen.findByRole('button', { name: 'Save draft' });
});

test('401 saves refresh once then return to login without blocking the auth redirect', async () => {
  const { user, writes } = setup({ override: async (_path, options) => options.method === 'PUT' ? reply({}, 401) : undefined });
  await newWinner(user); await user.click(screen.getByRole('button', { name: 'Save draft' })); await screen.findByRole('heading', { name: 'Sign in' }); expect(writes()).toHaveLength(2);
});

test('Forward cancellation also preserves a dirty draft and resets the blocker for another attempt', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { user } = setup({ initialEntries: [detail, '/admin/results?competition=1'] });
  await screen.findByRole('link', { name: 'Recital Draft' }); await user.click(screen.getByRole('button', { name: 'Back' })); await add(user, '0007');
  await user.click(screen.getByRole('button', { name: 'Forward' })); expect((screen.getByLabelText('External candidate ID') as HTMLInputElement).value).toBe('0007');
  confirm.mockReturnValue(true); await user.click(screen.getByRole('button', { name: 'Forward' })); await waitFor(() => expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull());
});

test('new rows receive focus and invalid required entries focus the validation summary', async () => {
  const { user, writes } = setup(); await user.click(await screen.findByRole('button', { name: 'Add winner' })); expect(document.activeElement).toBe(screen.getByLabelText('External candidate ID'));
  await user.click(screen.getByRole('button', { name: 'Save draft' })); await screen.findByRole('alert'); expect(document.activeElement?.textContent).toContain('external candidate ID is required'); expect(writes()).toHaveLength(0);
});

test('Madrassa option failures offer retry without changing the selected unit or candidate name', async () => {
  let fail = true;
  const { user } = setup({ override: async (path) => fail && path.endsWith('/madrasas') ? reply({}, 503) : undefined });
  const row = await add(user, '007'); await user.click(row.getByRole('button', { name: 'Look up candidate' })); await row.findByText(/New candidate/);
  await user.type(row.getByLabelText('Candidate name'), 'Kept name'); await user.selectOptions(row.getByLabelText('Unit'), '21'); await row.findByRole('button', { name: 'Retry Madrassas' });
  fail = false; await user.click(row.getByRole('button', { name: 'Retry Madrassas' })); await waitFor(() => expect(row.getByLabelText('Madrassa (optional)').matches(':disabled')).toBe(false));
  expect((row.getByLabelText('Candidate name') as HTMLInputElement).value).toBe('Kept name');
});

test('failed saves preserve edits and do not leak raw network errors or claim Saved', async () => {
  const { user } = setup({ override: async (_path, options) => { if (options.method === 'PUT') throw new Error('private network detail'); return undefined; } });
  await newWinner(user); await user.click(screen.getByRole('button', { name: 'Save draft' })); await screen.findByRole('alert');
  expect((screen.getByLabelText('Candidate name') as HTMLInputElement).value).toBe('New winner'); expect(document.body.textContent).not.toContain('private network detail'); expect(screen.queryByText('Draft saved.')).toBeNull();
});
