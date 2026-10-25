import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../App';
import type { AuthClient, AuthUser } from '../types/auth';
import type { AdminCompetition } from '../api/adminDashboardApi';

afterEach(cleanup);
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const initial: AdminCompetition[] = [
  { id: '1', name: 'North competition', code: 'N26', status: 'draft' },
  { id: '2', name: 'South competition', code: 'S26', status: 'active' },
  { id: '3', name: 'Historic competition', code: 'H25', status: 'archived' },
];
function Probe() {
  const location = useLocation(); const navigate = useNavigate();
  return <><output data-testid="location">{location.pathname + location.search}</output><button onClick={() => void navigate(-1)}>Back</button></>;
}
function setup({ path = '/admin/competitions?competition=1', empty = false, authorized = true, override }: {
  path?: string; empty?: boolean; authorized?: boolean;
  override?: (path: string, options: RequestInit) => Promise<Response | undefined>;
} = {}) {
  let competitions = empty ? [] : initial.map((item) => ({ ...item }));
  let points: Record<string, number> | null = { '1': 5, '2': 3 };
  const user: AuthUser = { uid: 'admin', email: 'admin@example.test', getIdToken: vi.fn(async (refresh) => refresh ? 'fresh' : 'opaque') };
  let listener: (user: AuthUser | null) => void;
  const client: AuthClient = {
    subscribe: (fn) => { listener = fn; queueMicrotask(() => fn(authorized ? user : null)); return () => {}; },
    signIn: vi.fn(async () => {}), signOut: vi.fn(async () => listener(null)),
  };
  const fetcher = vi.fn(async (url: string | URL | Request, options: RequestInit = {}) => {
    const path = String(url);
    if (path === '/api/admin/me') return reply({ uid: 'admin', email: user.email, emailVerified: true, admin: true });
    const custom = await override?.(path, options); if (custom) return custom;
    const method = options.method ?? 'GET';
    const body = options.body ? JSON.parse(String(options.body)) : undefined;
    if (path === '/api/admin/competitions') {
      if (method === 'POST') { const competition = { id: '4', ...body, status: 'draft' }; competitions = [competition, ...competitions]; return reply({ competition }, 201); }
      return reply({ competitions });
    }
    const id = path.split('/')[4];
    let competition = competitions.find((item) => item.id === id);
    if (path.endsWith('/settings')) {
      if (method === 'PUT') points = body.position_points;
      return reply({ settings: points === null ? null : { competition_id: id, position_points: points } });
    }
    if (path.endsWith('/units')) return reply({ units: [] });
    if (path.endsWith('/categories')) return reply({ categories: [] });
    if (!competition) return reply({ error: 'Competition not found' }, 404);
    if (method === 'PATCH') { competition = { ...competition, ...body }; competitions = competitions.map((item) => item.id === id ? competition! : item); }
    return reply({ competition });
  });
  render(<MemoryRouter initialEntries={[path]}><AppRoutes client={client} fetcher={fetcher as typeof fetch} /><Probe /></MemoryRouter>);
  const writes = () => fetcher.mock.calls.filter(([, options]) => options?.method && options.method !== 'GET');
  return { user: userEvent.setup(), fetcher, writes, client, firebaseUser: user, emit: (value: AuthUser | null) => listener(value) };
}

async function newForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'New competition' }));
  await user.type(screen.getByLabelText('Competition name'), ' New competition ');
  await user.type(screen.getByLabelText('Competition code'), ' 0026 ');
}

test('empty list supports creation, selects the returned draft, and retains context through routes and back', async () => {
  const { user, writes } = setup({ path: '/admin/competitions', empty: true });
  await screen.findByRole('heading', { name: 'No competitions yet' });
  await newForm(user);
  await user.click(screen.getByRole('button', { name: 'Create competition' }));
  await screen.findByText('Competition created as a draft.');
  await screen.findByLabelText('Name');
  expect(screen.getByTestId('location').textContent).toBe('/admin/competitions?competition=4');
  expect(JSON.parse(String(writes()[0][1]?.body))).toEqual({ name: ' New competition ', code: ' 0026 ' });
  expect(screen.queryByLabelText(/year/i)).toBeNull();
  await user.click(screen.getByRole('link', { name: 'Back to dashboard' }));
  await screen.findByRole('heading', { name: 'New competition' });
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await screen.findByLabelText('Name');
  expect(screen.getByTestId('location').textContent).toBe('/admin/competitions?competition=4');
});

test('create validates locally and preserves fields on API conflict', async () => {
  const { user, writes } = setup({ path: '/admin/competitions', override: async (_path, options) => options.method === 'POST' ? reply({ error: 'Competition code already exists' }, 409) : undefined });
  await user.click(await screen.findByRole('button', { name: 'New competition' }));
  await user.click(screen.getByRole('button', { name: 'Create competition' }));
  expect((await screen.findByRole('alert')).textContent).toContain('nonblank');
  expect(writes()).toHaveLength(0);
  await user.type(screen.getByLabelText('Competition name'), 'Test');
  await user.type(screen.getByLabelText('Competition code'), 'Duplicate');
  await user.click(screen.getByRole('button', { name: 'Create competition' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Competition code already exists');
  expect((screen.getByLabelText('Competition code') as HTMLInputElement).value).toBe('Duplicate');
});

test('creation locks inputs and prevents repeated submissions while awaiting response', async () => {
  let done!: (response: Response) => void;
  const { user, writes } = setup({ override: async (_path, options) => options.method === 'POST' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await newForm(user);
  await user.dblClick(screen.getByRole('button', { name: 'Create competition' }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(screen.getByRole('button', { name: 'Creating…' }).matches(':disabled')).toBe(true);
  fireEvent.submit(screen.getByRole('form', { name: 'Create competition' }));
  expect(writes()).toHaveLength(1);
  await act(async () => done(reply({ competition: { ...initial[0], id: '4' } }, 201)));
  await screen.findByText('Competition created as a draft.');
});

test('editing sends only changed supported fields and updates selector and list', async () => {
  const { user, writes } = setup();
  const name = await screen.findByLabelText('Name');
  await user.clear(name); await user.type(name, 'Updated North');
  await user.click(screen.getByRole('button', { name: 'Save details' }));
  await screen.findByText('Competition details saved.');
  expect(JSON.parse(String(writes()[0][1]?.body))).toEqual({ name: 'Updated North' });
  expect(writes()[0][0]).toBe('/api/admin/competitions/1');
  expect(screen.getByRole('option', { name: 'Updated North · draft · N26' })).toBeTruthy();
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Updated North');
});

test.each([['1', true, true], ['2', false, true], ['3', true, false]] as const)('only backend transitions are offered for competition %s', async (id, activate, archive) => {
  setup({ path: `/admin/competitions?competition=${id}` });
  await screen.findByLabelText('Name');
  expect(Boolean(screen.queryByRole('button', { name: 'Activate competition' }))).toBe(activate);
  expect(Boolean(screen.queryByRole('button', { name: 'Archive competition' }))).toBe(archive);
  expect(screen.queryByRole('button', { name: /draft/i })).toBeNull();
});

test('status changes require confirmation, submit once and update selected context', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { user, writes } = setup();
  await user.click(await screen.findByRole('button', { name: 'Activate competition' }));
  expect(writes()).toHaveLength(0);
  confirm.mockReturnValue(true);
  await user.click(screen.getByRole('button', { name: 'Activate competition' }));
  await screen.findByText('Competition is now active.');
  expect(JSON.parse(String(writes()[0][1]?.body))).toEqual({ status: 'active' });
  expect(screen.queryByRole('button', { name: 'Activate competition' })).toBeNull();
  expect(screen.getByRole('option', { name: 'North competition · active · N26' })).toBeTruthy();
});

test('backend invalid transition feedback is shown and explicit reload recovers the latest status', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  let conflict = false;
  const { user } = setup({ override: async (path, options) => {
    if (options.method === 'PATCH') { conflict = true; return reply({ error: 'Invalid competition status transition' }, 409); }
    if (conflict && path === '/api/admin/competitions/1') return reply({ competition: { ...initial[0], status: 'active' } });
  } });
  await user.click(await screen.findByRole('button', { name: 'Activate competition' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Invalid competition status transition');
  await user.click(screen.getByRole('button', { name: 'Reload details' }));
  await screen.findByLabelText('Name');
  expect(screen.queryByRole('button', { name: 'Activate competition' })).toBeNull();
});

test('points settings replace the complete map after confirmation, including zero and removals', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const { user, writes } = setup({ path: '/admin/settings?competition=2' });
  const points = await screen.findByLabelText('Points for row 1');
  await user.clear(points); await user.type(points, '0');
  await user.click(screen.getByRole('button', { name: 'Remove position row 2' }));
  await user.click(screen.getByRole('button', { name: 'Add position' }));
  await user.type(screen.getByLabelText('Position 2'), '3');
  await user.type(screen.getByLabelText('Points for row 2'), '9007199254740991');
  await user.click(screen.getByRole('button', { name: 'Save shared points' }));
  await screen.findByText('Shared points saved. Published leaderboards use this configuration.');
  expect(writes()[0][0]).toBe('/api/admin/competitions/2/settings');
  expect(JSON.parse(String(writes()[0][1]?.body))).toEqual({ position_points: { '1': 0, '3': 9007199254740991 } });
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('all published leaderboards'));
});

test('cancelled points confirmation makes no write and preserves edits', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { user, writes } = setup({ path: '/admin/settings?competition=1' });
  const points = await screen.findByLabelText('Points for row 1');
  await user.clear(points); await user.type(points, '9');
  await user.click(screen.getByRole('button', { name: 'Save shared points' }));
  expect(writes()).toHaveLength(0);
  expect((points as HTMLInputElement).value).toBe('9');
});

test.each(['0', '01', '1.5', '2147483648'])('invalid position %s preserves unsaved edits without submitting', async (value) => {
  const { user, writes } = setup({ path: '/admin/settings?competition=1' });
  const position = await screen.findByLabelText('Position 1');
  await user.clear(position); await user.type(position, value);
  await user.click(screen.getByRole('button', { name: 'Save shared points' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Positions must');
  expect((position as HTMLInputElement).value).toBe(value);
  expect(writes()).toHaveLength(0);
});

test.each(['-1', '1.5', '9007199254740992', '1e3', ''])('invalid points %s never submit', async (value) => {
  const { user, writes } = setup({ path: '/admin/settings?competition=1' });
  const points = await screen.findByLabelText('Points for row 1');
  await user.clear(points); if (value) await user.type(points, value);
  await user.click(screen.getByRole('button', { name: 'Save shared points' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Points must');
  expect(writes()).toHaveLength(0);
});

test('duplicate positions and server validation errors keep editable values', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const { user } = setup({ path: '/admin/settings?competition=1', override: async (_path, options) => options.method === 'PUT' ? reply({ error: 'Points must be non-negative safe whole numbers' }, 400) : undefined });
  const position = await screen.findByLabelText('Position 2');
  await user.clear(position); await user.type(position, '1');
  await user.click(screen.getByRole('button', { name: 'Save shared points' }));
  expect((await screen.findByRole('alert')).textContent).toContain('unique');
  await user.clear(position); await user.type(position, '4');
  await user.click(screen.getByRole('button', { name: 'Save shared points' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Points must be non-negative safe whole numbers');
  expect((position as HTMLInputElement).value).toBe('4');
});

test('null settings are unconfigured and clearing positions sends an empty map after confirmation', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const { user, writes } = setup({ path: '/admin/settings?competition=1' });
  await screen.findByLabelText('Position 1');
  await user.click(screen.getByRole('button', { name: 'Remove position row 2' }));
  await user.click(screen.getByRole('button', { name: 'Remove position row 1' }));
  await user.click(screen.getByRole('button', { name: 'Save shared points' }));
  await screen.findByText('Shared points saved. Published leaderboards use this configuration.');
  expect(JSON.parse(String(writes()[0][1]?.body))).toEqual({ position_points: {} });
  cleanup();
  setup({ path: '/admin/settings?competition=1', override: async (path) => path.endsWith('/settings') ? reply({ settings: null }) : undefined });
  await screen.findByText('No winning positions configured. No default points are assumed.');
  expect(screen.getByRole('button', { name: 'Add position' })).toBeTruthy();
});

test('unsaved edits warn on selection, navigation, signout and browser unload; cancel preserves data', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { user, client } = setup();
  const name = await screen.findByLabelText('Name'); await user.type(name, ' changed');
  await user.selectOptions(screen.getByRole('combobox'), '2');
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('1');
  await user.click(screen.getByRole('link', { name: 'Dashboard' }));
  expect(screen.getByLabelText('Name')).toBe(name);
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(client.signOut).not.toHaveBeenCalled();
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
  expect(confirm).toHaveBeenCalledTimes(3);
  confirm.mockReturnValue(true);
  await user.selectOptions(screen.getByRole('combobox'), '2');
  await waitFor(() => expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('South competition'));
});

test('background auth verification preserves unsaved competition details', async () => {
  const { user, fetcher } = setup();
  const name = await screen.findByLabelText('Name'); await user.type(name, ' unsaved');
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(fetcher.mock.calls.filter(([path]) => path === '/api/admin/me')).toHaveLength(2));
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('North competition unsaved');
});

test.each([401, 403])('mutation authorization status %s removes management content', async (status) => {
  const { user, writes } = setup({ override: async (_path, options) => options.method === 'PATCH' ? reply({}, status) : undefined });
  const name = await screen.findByLabelText('Name'); await user.type(name, ' changed');
  await user.click(screen.getByRole('button', { name: 'Save details' }));
  await screen.findByRole('heading', { name: status === 401 ? 'Sign in' : 'Access denied' });
  expect(screen.queryByLabelText('Name')).toBeNull();
  expect(writes()).toHaveLength(status === 401 ? 2 : 1);
});

test('signed-out competition management direct links do not send requests', async () => {
  const { fetcher } = setup({ authorized: false });
  await screen.findByRole('heading', { name: 'Sign in' });
  expect(fetcher).not.toHaveBeenCalled();
});

test.each(['details', 'settings'])('%s loading errors can be retried without exposing an editable blank form', async (kind) => {
  let fail = true;
  const path = kind === 'settings' ? '/admin/settings?competition=1' : '/admin/competitions?competition=1';
  const { user } = setup({ path, override: async (url) => {
    if (fail && url === `/api/admin/competitions/1${kind === 'settings' ? '/settings' : ''}`) return reply({}, 500);
  } });
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: kind === 'settings' ? 'Save shared points' : 'Save details' })).toBeNull();
  fail = false;
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByLabelText(kind === 'settings' ? 'Position 1' : 'Name');
});

test('late detail reads cannot overwrite a newer selected competition', async () => {
  let done!: (response: Response) => void;
  const { user } = setup({ override: async (path) => path === '/api/admin/competitions/1' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await screen.findByText('Loading competition details…');
  await waitFor(() => expect(done).toBeTypeOf('function'));
  await user.selectOptions(screen.getByRole('combobox'), '2');
  await screen.findByLabelText('Name');
  await act(async () => done(reply({ competition: { ...initial[0], name: 'Stale detail' } })));
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('South competition');
  expect(screen.queryByRole('option', { name: /Stale detail/ })).toBeNull();
});

test('late mutation responses do not change a different competition after confirmed navigation', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  let done!: (response: Response) => void;
  const { user } = setup({ override: async (_path, options) => options.method === 'PATCH' ? new Promise((resolve) => { done = resolve; }) : undefined });
  const name = await screen.findByLabelText('Name'); await user.type(name, ' changed');
  await user.click(screen.getByRole('button', { name: 'Save details' }));
  await waitFor(() => expect(done).toBeTypeOf('function'));
  await user.selectOptions(screen.getByRole('combobox'), '2');
  await screen.findByLabelText('Name');
  await act(async () => done(reply({ competition: { ...initial[0], name: 'Old response' } })));
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('South competition');
  expect(screen.queryByText('Competition details saved.')).toBeNull();
});

test('pending points save locks rows and prevents repeated submit events', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  let done!: (response: Response) => void;
  const { user, writes } = setup({ path: '/admin/settings?competition=1', override: async (_path, options) => options.method === 'PUT' ? new Promise((resolve) => { done = resolve; }) : undefined });
  const points = await screen.findByLabelText('Points for row 1');
  await user.clear(points); await user.type(points, '7');
  await user.dblClick(screen.getByRole('button', { name: 'Save shared points' }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(screen.getByRole('button', { name: 'Add position' }).matches(':disabled')).toBe(true);
  fireEvent.submit(screen.getByRole('form', { name: 'Shared points configuration' }));
  expect(writes()).toHaveLength(1);
  await act(async () => done(reply({ settings: { competition_id: '1', position_points: { '1': 7, '2': 3 } } })));
  await screen.findByText('Shared points saved. Published leaderboards use this configuration.');
});

test('pending lifecycle change disables other transitions and duplicate requests', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  let done!: (response: Response) => void;
  const { user, writes } = setup({ override: async (path, options) => path.endsWith('/status') && options.method === 'PATCH' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await user.dblClick(await screen.findByRole('button', { name: 'Activate competition' }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(screen.getByRole('button', { name: 'Archive competition' }).matches(':disabled')).toBe(true);
  await act(async () => done(reply({ competition: { ...initial[0], status: 'active' } })));
  await screen.findByText('Competition is now active.');
});

test('detail validation and server errors retain entered values and Firebase headers', async () => {
  const { user, writes } = setup({ override: async (_path, options) => options.method === 'PATCH' ? reply({ error: 'Competition code already exists' }, 409) : undefined });
  const name = await screen.findByLabelText('Name'); await user.clear(name);
  await user.click(screen.getByRole('button', { name: 'Save details' }));
  expect((await screen.findByRole('alert')).textContent).toContain('nonblank'); expect(writes()).toHaveLength(0);
  await user.type(name, 'New name');
  await user.click(screen.getByRole('button', { name: 'Save details' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Competition code already exists');
  expect((name as HTMLInputElement).value).toBe('New name');
  expect(writes()[0][1]?.headers).toEqual({ Authorization: 'Bearer opaque', Accept: 'application/json', 'Content-Type': 'application/json' });
});

test('settings without selection never fetch settings or permit a save', async () => {
  const { fetcher } = setup({ path: '/admin/settings' });
  await screen.findByText('Select a competition above to configure its shared points.');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('button', { name: 'Save shared points' })).toBeNull();
});

test('background access checks during a pending mutation do not invalidate its successful response', async () => {
  let done!: (response: Response) => void;
  const { user } = setup({ override: async (_path, options) => options.method === 'PATCH' ? new Promise((resolve) => { done = resolve; }) : undefined });
  const name = await screen.findByLabelText('Name'); await user.type(name, ' saved');
  await user.click(screen.getByRole('button', { name: 'Save details' }));
  await waitFor(() => expect(done).toBeTypeOf('function'));
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await act(async () => done(reply({ competition: { ...initial[0], name: 'North competition saved' } })));
  await screen.findByText('Competition details saved.');
});

test('a 401 mutation retry survives the Firebase token-change subscription callback', async () => {
  let attempt = 0;
  const context = setup({ override: async (_path, options) => options.method === 'PATCH' && ++attempt === 1 ? reply({}, 401) : undefined });
  const name = await screen.findByLabelText('Name');
  vi.mocked(context.firebaseUser.getIdToken).mockImplementation(async (refresh) => {
    if (refresh) context.emit(context.firebaseUser);
    return refresh ? 'refreshed' : 'opaque';
  });
  await context.user.type(name, ' updated');
  await context.user.click(screen.getByRole('button', { name: 'Save details' }));
  await screen.findByText('Competition details saved.');
  expect(context.writes()).toHaveLength(2);
  expect(context.writes()[1][1]?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer refreshed' }));
});
