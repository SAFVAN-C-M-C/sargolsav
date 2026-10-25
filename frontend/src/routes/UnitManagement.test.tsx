import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../App';
import type { AuthClient, AuthUser } from '../types/auth';
import type { AdminMadrassa, AdminUnit } from '../types/adminParticipants';

afterEach(cleanup);
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: vi.fn(async () => body) }) as unknown as Response;
const unit = (id: string, competition_id: string, name: string): AdminUnit => ({ id, competition_id, name });
const madrassa = (id: string, competition_id: string, unit_id: string, name: string): AdminMadrassa => ({ id, competition_id, unit_id, name });
function Probe() {
  const location = useLocation(); const navigate = useNavigate();
  return <><output data-testid="location">{location.pathname + location.search}</output><button onClick={() => void navigate(-1)}>Back</button><button onClick={() => void navigate(1)}>Forward</button></>;
}
function setup({ path = '/admin/units?competition=1', empty = false, signedIn = true, override }: {
  path?: string; empty?: boolean; signedIn?: boolean;
  override?: (path: string, options: RequestInit) => Promise<Response | undefined>;
} = {}) {
  let units = empty ? [] : [unit('11', '1', 'North Unit'), unit('12', '1', 'Unit without Madrassas'), unit('21', '2', 'Other competition unit')];
  let madrasas = empty ? [] : [madrassa('111', '1', '11', 'Central Madrassa'), madrassa('112', '1', '11', 'South Madrassa'), madrassa('211', '2', '21', 'Other competition Madrassa')];
  const currentUser: AuthUser = { uid: 'admin', email: 'admin@example.test', getIdToken: vi.fn(async (refresh) => refresh ? 'fresh' : 'opaque') };
  let listener: (user: AuthUser | null) => void;
  const client: AuthClient = {
    subscribe: (fn) => { listener = fn; queueMicrotask(() => fn(signedIn ? currentUser : null)); return () => {}; },
    signIn: vi.fn(async () => {}), signOut: vi.fn(async () => listener(null)),
  };
  const deletions: Response[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, options: RequestInit = {}) => {
    const path = String(url); const method = options.method ?? 'GET';
    if (path === '/api/admin/me') return reply({ uid: 'admin', email: currentUser.email, emailVerified: true, admin: true });
    const custom = await override?.(path, options); if (custom) return custom;
    if (path === '/api/admin/competitions') return reply({ competitions: [{ id: '1', name: 'First competition', code: 'C1', status: 'active' }, { id: '2', name: 'Second competition', code: 'C2', status: 'archived' }] });
    const segments = path.split('/'); const competitionId = segments[4]; const unitId = segments[6]; const madrassaId = segments[8];
    const isMadrassa = segments[7] === 'madrasas';
    const body = options.body ? JSON.parse(String(options.body)) : undefined;
    if (isMadrassa) {
      if (!units.some((row) => row.id === unitId && row.competition_id === competitionId)) return reply({ error: 'Unit not found' }, 404);
      if (method === 'POST') { const row = madrassa('113', competitionId, unitId, body.name); madrasas = [row, ...madrasas]; return reply({ madrasa: row }, 201); }
      if (!madrassaId) return reply({ madrasas: madrasas.filter((row) => row.competition_id === competitionId && row.unit_id === unitId) });
      const row = madrasas.find((row) => row.id === madrassaId && row.competition_id === competitionId && row.unit_id === unitId);
      if (!row) return reply({ error: 'Madrassa not found' }, 404);
      if (method === 'PATCH') { const saved = { ...row, name: body.name }; madrasas = madrasas.map((item) => item === row ? saved : item); return reply({ madrasa: saved }); }
      if (method === 'DELETE') { madrasas = madrasas.filter((item) => item !== row); const response = reply(undefined, 204); deletions.push(response); return response; }
      return reply({ madrasa: row });
    }
    if (segments[5] === 'units') {
      if (method === 'POST') { const row = unit('13', competitionId, body.name); units = [row, ...units]; return reply({ unit: row }, 201); }
      if (!unitId) return reply({ units: units.filter((row) => row.competition_id === competitionId) });
      const row = units.find((row) => row.id === unitId && row.competition_id === competitionId);
      if (!row) return reply({ error: 'Unit not found' }, 404);
      if (method === 'PATCH') { const saved = { ...row, name: body.name }; units = units.map((item) => item === row ? saved : item); return reply({ unit: saved }); }
      if (method === 'DELETE') { units = units.filter((item) => item !== row); const response = reply(undefined, 204); deletions.push(response); return response; }
      return reply({ unit: row });
    }
    if (path.endsWith('/categories')) return reply({ categories: [] });
    return reply({ error: 'Not found' }, 404);
  });
  render(<MemoryRouter initialEntries={[path]}><AppRoutes client={client} fetcher={fetcher as typeof fetch} /><Probe /></MemoryRouter>);
  return { user: userEvent.setup(), fetcher, client, currentUser, deletions,
    writes: () => fetcher.mock.calls.map(([path, options = {}]) => [path, options] as const).filter(([, options]) => options.method && options.method !== 'GET') };
}
async function enterName(user: ReturnType<typeof userEvent.setup>, kind: 'Unit' | 'Madrassa', name: string) {
  const field = await screen.findByLabelText(`${kind} name`); await user.clear(field); if (name) await user.type(field, name);
  return field;
}

test('units list is scoped to competition and an empty list permits a unit without Madrassas', async () => {
  const { user, writes } = setup({ empty: true });
  await screen.findByRole('heading', { name: 'No units yet' });
  await user.click(screen.getByRole('link', { name: 'New unit' }));
  await enterName(user, 'Unit', ' New Unit ');
  expect(screen.queryByLabelText('Madrassa name')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Create unit' }));
  await screen.findByText('Unit created.');
  await screen.findByRole('heading', { name: 'No Madrassas yet' });
  expect(screen.getByTestId('location').textContent).toBe('/admin/units?competition=1&unit=13');
  expect(writes()[0][0]).toBe('/api/admin/competitions/1/units');
  expect(JSON.parse(String(writes()[0][1].body))).toEqual({ name: ' New Unit ' });
});

test('existing units and optional Madrassa count load without another competition data', async () => {
  const { user } = setup();
  await screen.findByRole('link', { name: 'North Unit' });
  expect(screen.queryByText('Other competition unit')).toBeNull();
  await user.click(screen.getByRole('link', { name: 'North Unit' }));
  await screen.findByText('2 Madrassas');
  expect(screen.getByRole('link', { name: 'Central Madrassa' })).toBeTruthy();
  await user.click(screen.getByRole('link', { name: 'Unit without Madrassas' }));
  await screen.findByText('0 Madrassas');
  expect(screen.queryByRole('link', { name: 'Central Madrassa' })).toBeNull();
});

test('unit detail editing refreshes both detail and list with exact supported fields', async () => {
  const { user, writes, fetcher } = setup({ path: '/admin/units?competition=1&unit=11' });
  await user.click(await screen.findByRole('link', { name: 'Edit unit' }));
  await enterName(user, 'Unit', 'Renamed unit');
  await user.click(screen.getByRole('button', { name: 'Save unit' }));
  await screen.findByText('Unit saved.');
  await screen.findByRole('heading', { name: 'Renamed unit' });
  expect(screen.getByRole('link', { name: 'Renamed unit' })).toBeTruthy();
  expect(JSON.parse(String(writes()[0][1].body))).toEqual({ name: 'Renamed unit' });
  expect(writes()[0][1].method).toBe('PATCH');
  expect(fetcher.mock.calls.filter(([path]) => path === '/api/admin/competitions/1/units')).toHaveLength(2);
});

test('confirmed unit deletion handles 204 without JSON parsing and refreshes the list', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { user, writes, deletions } = setup({ path: '/admin/units?competition=1&unit=12' });
  await user.click(await screen.findByRole('button', { name: 'Delete unit' }));
  expect(writes()).toHaveLength(0);
  confirm.mockReturnValue(true);
  await user.click(screen.getByRole('button', { name: 'Delete unit' }));
  await screen.findByText('Unit deleted.');
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Unit without Madrassas' })).toBeNull());
  expect(writes()[0][1]).toEqual(expect.objectContaining({ method: 'DELETE', headers: { Authorization: 'Bearer opaque', Accept: 'application/json' } }));
  expect(writes()[0][1].body).toBeUndefined();
  expect(deletions[0].json).not.toHaveBeenCalled();
  expect(screen.getByTestId('location').textContent).toBe('/admin/units?competition=1');
});

test('Madrassa creation preserves the parent and refreshes the nested list and count', async () => {
  const { user, writes } = setup({ path: '/admin/units?competition=1&unit=12' });
  await user.click(await screen.findByRole('link', { name: 'New Madrassa' }));
  await enterName(user, 'Madrassa', 'New Madrassa name');
  await user.click(screen.getByRole('button', { name: 'Create Madrassa' }));
  await screen.findByText('Madrassa created.');
  await screen.findByText('1 Madrassa');
  await screen.findByRole('heading', { name: 'New Madrassa name' });
  expect(writes()[0][0]).toBe('/api/admin/competitions/1/units/12/madrasas');
  expect(JSON.parse(String(writes()[0][1].body))).toEqual({ name: 'New Madrassa name' });
  expect(screen.getByTestId('location').textContent).toBe('/admin/units?competition=1&unit=12&madrasa=113');
});

test('direct Madrassa link supports viewing, editing and deletion with its parent fixed', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const { user, writes } = setup({ path: '/admin/units?competition=1&unit=11&madrasa=111' });
  await screen.findByRole('heading', { name: 'Central Madrassa' });
  await user.click(screen.getByRole('link', { name: 'Edit Madrassa' }));
  await enterName(user, 'Madrassa', 'Renamed Madrassa');
  await user.click(screen.getByRole('button', { name: 'Save Madrassa' }));
  await screen.findByText('Madrassa saved.');
  await screen.findByRole('heading', { name: 'Renamed Madrassa' });
  expect(screen.getByRole('link', { name: 'Renamed Madrassa' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Delete Madrassa' }));
  await screen.findByText('Madrassa deleted.');
  await screen.findByText('1 Madrassa');
  expect(screen.queryByRole('link', { name: 'Renamed Madrassa' })).toBeNull();
  expect(writes().map(([path]) => path)).toEqual(['/api/admin/competitions/1/units/11/madrasas/111', '/api/admin/competitions/1/units/11/madrasas/111']);
  expect(screen.getByTestId('location').textContent).toBe('/admin/units?competition=1&unit=11');
});

test.each(['Unit', 'Madrassa'] as const)('%s validates blank names and retains duplicate-name errors and entered values', async (kind) => {
  const { user, writes } = setup({ path: '/admin/units?competition=1&unit=11', override: async (_path, options) => options.method === 'POST' ? reply({ error: `${kind} name already exists in this parent` }, 409) : undefined });
  await user.click(await screen.findByRole('link', { name: kind === 'Unit' ? 'New unit' : 'New Madrassa' }));
  await user.click(screen.getByRole('button', { name: `Create ${kind === 'Unit' ? 'unit' : kind}` }));
  expect((await screen.findByRole('alert')).textContent).toContain('Name is required'); expect(writes()).toHaveLength(0);
  const field = await enterName(user, kind, 'Duplicate name');
  await user.click(screen.getByRole('button', { name: `Create ${kind === 'Unit' ? 'unit' : kind}` }));
  expect((await screen.findByRole('alert')).textContent).toContain('name already exists in this parent');
  expect((field as HTMLInputElement).value).toBe('Duplicate name');
});

test.each(['unit', 'Madrassa'] as const)('protected %s deletion retains the record and shows a friendly dependency explanation', async (kind) => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const { user } = setup({ path: `/admin/units?competition=1&unit=11${kind === 'Madrassa' ? '&madrasa=111' : ''}`, override: async (_path, options) => options.method === 'DELETE' ? reply({ error: 'Referenced by dependent records' }, 409) : undefined });
  await user.click(await screen.findByRole('button', { name: `Delete ${kind}` }));
  const error = await screen.findByRole('alert');
  expect(error.textContent).toContain('cannot be deleted'); expect(error.textContent).toContain('candidates or results');
  expect(screen.getByRole('heading', { name: kind === 'unit' ? 'North Unit' : 'Central Madrassa' })).toBeTruthy();
});

test('competition switching clears child selection and browser history restores scoped direct links', async () => {
  const { user, fetcher } = setup({ path: '/admin/units?competition=1&unit=11&madrasa=111&participantForm=madrasa' });
  await screen.findByLabelText('Madrassa name');
  await user.selectOptions(screen.getByRole('combobox'), '2');
  await screen.findByRole('link', { name: 'Other competition unit' });
  expect(screen.getByTestId('location').textContent).toBe('/admin/units?competition=2');
  expect(screen.queryByLabelText('Madrassa name')).toBeNull();
  expect(fetcher.mock.calls.some(([path]) => String(path).includes('/competitions/2/units/11'))).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await screen.findByLabelText('Madrassa name');
  expect((screen.getByLabelText('Madrassa name') as HTMLInputElement).value).toBe('Central Madrassa');
  await user.click(screen.getByRole('button', { name: 'Forward' }));
  await screen.findByRole('link', { name: 'Other competition unit' });
});

test('unsaved participant names warn on links, cancellation, selection and unload', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { user } = setup({ path: '/admin/units?competition=1&unit=11&participantForm=unit' });
  const field = await enterName(user, 'Unit', 'Unsaved name');
  await user.click(screen.getByRole('link', { name: 'Cancel' }));
  await user.click(screen.getByRole('link', { name: 'Unit without Madrassas' }));
  await user.selectOptions(screen.getByRole('combobox'), '2');
  expect((field as HTMLInputElement).value).toBe('Unsaved name');
  expect(confirm).toHaveBeenCalledTimes(3);
  const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
  confirm.mockReturnValue(true);
  await user.click(screen.getByRole('link', { name: 'Cancel' }));
  await screen.findByRole('heading', { name: 'North Unit' });
  expect(screen.queryByLabelText('Unit name')).toBeNull();
});

test.each(['unit', 'Madrassa'] as const)('pending %s creation disables fields and ignores duplicate submit events', async (kind) => {
  let done!: (response: Response) => void;
  const { user, writes } = setup({ path: '/admin/units?competition=1&unit=11', override: async (_path, options) => options.method === 'POST' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await user.click(await screen.findByRole('link', { name: kind === 'unit' ? 'New unit' : 'New Madrassa' }));
  await enterName(user, kind === 'unit' ? 'Unit' : 'Madrassa', 'Created');
  await user.dblClick(screen.getByRole('button', { name: `Create ${kind}` }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(screen.getByRole('button', { name: 'Saving…' }).matches(':disabled')).toBe(true);
  fireEvent.submit(screen.getByRole('form', { name: `Create ${kind}` })); expect(writes()).toHaveLength(1);
  await act(async () => done(reply(kind === 'unit' ? { unit: unit('13', '1', 'Created') } : { madrasa: madrassa('113', '1', '11', 'Created') }, 201)));
  await screen.findByText(kind === 'unit' ? 'Unit created.' : 'Madrassa created.');
});

test('pending deletion sends only one request and removes edit/delete actions on completion', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  let done!: (response: Response) => void;
  const { user, writes } = setup({ path: '/admin/units?competition=1&unit=12', override: async (_path, options) => options.method === 'DELETE' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await user.dblClick(await screen.findByRole('button', { name: 'Delete unit' }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(screen.getByRole('button', { name: 'Deleting…' }).matches(':disabled')).toBe(true);
  await act(async () => done(reply(undefined, 204)));
  await screen.findByText('Unit deleted.');
  expect(screen.queryByRole('button', { name: 'Delete unit' })).toBeNull();
});

test.each([401, 403])('participant write authorization failure %s removes protected content', async (status) => {
  const { user, writes } = setup({ path: '/admin/units?competition=1&unit=11&participantForm=unit', override: async (_path, options) => options.method === 'PATCH' ? reply({}, status) : undefined });
  await enterName(user, 'Unit', 'Changed'); await user.click(screen.getByRole('button', { name: 'Save unit' }));
  await screen.findByRole('heading', { name: status === 401 ? 'Sign in' : 'Access denied' });
  expect(screen.queryByLabelText('Unit name')).toBeNull(); expect(writes()).toHaveLength(status === 401 ? 2 : 1);
});

test('signed-out direct unit links do not request admin data', async () => {
  const { fetcher } = setup({ path: '/admin/units?competition=1&unit=11&madrasa=111', signedIn: false });
  await screen.findByRole('heading', { name: 'Sign in' }); expect(fetcher).not.toHaveBeenCalled();
});

test('no selection does not fetch units or offer forms', async () => {
  const { fetcher } = setup({ path: '/admin/units' });
  await screen.findByText('Select a competition above to manage its units and optional Madrassas.');
  expect(fetcher).toHaveBeenCalledTimes(2); expect(screen.queryByRole('link', { name: 'New unit' })).toBeNull();
});

test('loading units and list errors have a retry without fabricated empty data', async () => {
  let done!: (response: Response) => void; let first = true;
  const { user } = setup({ override: async (path) => {
    if (path === '/api/admin/competitions/1/units' && first) { first = false; return new Promise((resolve) => { done = resolve; }); }
  } });
  await screen.findByText('Loading units…'); await waitFor(() => expect(done).toBeTypeOf('function'));
  await act(async () => done(reply({}, 500)));
  await screen.findByRole('alert'); expect(screen.queryByText('No units yet')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('link', { name: 'North Unit' });
});

test('Madrassa list errors retain parent context and can be retried', async () => {
  let fail = true;
  const { user } = setup({ path: '/admin/units?competition=1&unit=11', override: async (path) => path.endsWith('/madrasas') && fail ? reply({}, 503) : undefined });
  await screen.findByRole('alert'); expect(screen.getByRole('heading', { name: 'North Unit' })).toBeTruthy();
  fail = false; await user.click(screen.getByRole('button', { name: 'Try again' })); await screen.findByText('2 Madrassas');
});

test.each(['unit', 'Madrassa'] as const)('%s API save failure preserves the entered name and hides raw server detail', async (kind) => {
  const { user } = setup({ path: `/admin/units?competition=1&unit=11${kind === 'Madrassa' ? '&madrasa=111' : ''}`, override: async (_path, options) => options.method === 'PATCH' ? reply({ error: 'private transport detail' }, 500) : undefined });
  await user.click(await screen.findByRole('link', { name: `Edit ${kind}` }));
  const input = await enterName(user, kind === 'unit' ? 'Unit' : 'Madrassa', 'Preserved edit');
  await user.click(screen.getByRole('button', { name: `Save ${kind}` }));
  await screen.findByRole('alert'); expect((input as HTMLInputElement).value).toBe('Preserved edit');
  expect(document.body.textContent).not.toContain('private transport detail');
});

test('stale units list from another competition cannot appear after switching', async () => {
  let done!: (response: Response) => void;
  const { user } = setup({ override: async (path) => path === '/api/admin/competitions/1/units' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await screen.findByText('Loading units…'); await waitFor(() => expect(done).toBeTypeOf('function'));
  await user.selectOptions(screen.getByRole('combobox'), '2'); await screen.findByRole('link', { name: 'Other competition unit' });
  await act(async () => done(reply({ units: [unit('11', '1', 'Stale unit')] })));
  expect(screen.queryByRole('link', { name: 'Stale unit' })).toBeNull();
  expect(within(screen.getByRole('list', { name: 'Units' })).getAllByRole('link')).toHaveLength(1);
});

test('wrong-parent Madrassa direct links do not expose another unit record', async () => {
  const { fetcher } = setup({ path: '/admin/units?competition=1&unit=12&madrasa=111' });
  await screen.findByRole('alert'); expect(screen.queryByRole('heading', { name: 'Central Madrassa' })).toBeNull();
  expect(fetcher).toHaveBeenCalledWith('/api/admin/competitions/1/units/12/madrasas/111', expect.anything());
});

test('late Madrassa lists cannot replace the newly selected unit children', async () => {
  let done!: (response: Response) => void;
  const { user } = setup({ path: '/admin/units?competition=1&unit=11', override: async (path) => path === '/api/admin/competitions/1/units/11/madrasas' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await screen.findByText('Loading Madrassas…'); await waitFor(() => expect(done).toBeTypeOf('function'));
  await user.click(screen.getByRole('link', { name: 'Unit without Madrassas' }));
  await screen.findByText('0 Madrassas');
  await act(async () => done(reply({ madrasas: [madrassa('111', '1', '11', 'Late Madrassa')] })));
  expect(screen.queryByText('Late Madrassa')).toBeNull(); expect(screen.getByRole('heading', { name: 'No Madrassas yet' })).toBeTruthy();
});

test('late participant mutations cannot change another competition selection or lists', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  let done!: (response: Response) => void;
  const { user } = setup({ path: '/admin/units?competition=1&unit=11&participantForm=new-madrasa', override: async (_path, options) => options.method === 'POST' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await enterName(user, 'Madrassa', 'Old scope name'); await user.click(screen.getByRole('button', { name: 'Create Madrassa' }));
  await waitFor(() => expect(done).toBeTypeOf('function'));
  await user.selectOptions(screen.getByRole('combobox'), '2'); await screen.findByRole('link', { name: 'Other competition unit' });
  await act(async () => done(reply({ madrasa: madrassa('113', '1', '11', 'Old scope name') }, 201)));
  expect(screen.getByTestId('location').textContent).toBe('/admin/units?competition=2');
  expect(screen.queryByText('Madrassa created.')).toBeNull(); expect(screen.queryByText('Old scope name')).toBeNull();
});

test.each(['unit', 'Madrassa'] as const)('%s detail errors allow retry before editing', async (kind) => {
  let fail = true;
  const detailPath = `/api/admin/competitions/1/units/11${kind === 'Madrassa' ? '/madrasas/111' : ''}`;
  const { user } = setup({ path: `/admin/units?competition=1&unit=11${kind === 'Madrassa' ? '&madrasa=111' : ''}`, override: async (path) => path === detailPath && fail ? reply({}, 503) : undefined });
  await screen.findByRole('alert'); expect(screen.queryByRole('link', { name: `Edit ${kind}` })).toBeNull();
  fail = false; await user.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('link', { name: `Edit ${kind}` });
});

test('unsaved Madrassa editing warns before changing unit and hides parent deletion', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { user } = setup({ path: '/admin/units?competition=1&unit=11&madrasa=111&participantForm=madrasa' });
  const input = await enterName(user, 'Madrassa', 'Unsaved child');
  expect(screen.queryByRole('button', { name: 'Delete unit' })).toBeNull();
  await user.click(screen.getByRole('link', { name: 'Unit without Madrassas' }));
  expect(confirm).toHaveBeenCalledOnce(); expect((input as HTMLInputElement).value).toBe('Unsaved child');
});

test('a successful malformed response from another competition is rejected without exposing its name', async () => {
  setup({ path: '/admin/units?competition=1&unit=11', override: async (path) => path === '/api/admin/competitions/1/units/11' ? reply({ unit: unit('11', '2', 'Foreign private unit') }) : undefined });
  await screen.findByRole('alert'); expect(screen.queryByText('Foreign private unit')).toBeNull();
  expect(screen.queryByRole('link', { name: 'Edit unit' })).toBeNull();
});

test('unit read denial removes management access without sending writes', async () => {
  const { writes } = setup({ override: async (path) => path.endsWith('/units') ? reply({}, 403) : undefined });
  await screen.findByRole('heading', { name: 'Access denied' }); expect(writes()).toHaveLength(0);
  expect(screen.queryByRole('link', { name: 'New unit' })).toBeNull();
});
