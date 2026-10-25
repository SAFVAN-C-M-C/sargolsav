import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../App';
import type { AuthClient, AuthUser } from '../types/auth';

afterEach(cleanup);
const competitions = [
  { id: '1', name: 'Sargolsav North 2026', code: 'N26', status: 'active' },
  { id: '2', name: 'Sargolsav South 2026', code: 'S26', status: 'active' },
  { id: '3', name: 'Historical competition with a very long name', code: '2025', status: 'archived' },
];
const response = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body }) as Response;
function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="location">{location.pathname + location.search}</output><button onClick={() => void navigate(-1)}>Go back</button></>;
}
function setup(path = '/admin', override?: (path: string, options?: RequestInit) => Promise<Response>, signedIn = true) {
  const currentUser: AuthUser = { uid: 'admin', email: 'admin@example.test', getIdToken: vi.fn(async (refresh) => refresh ? 'fresh-token' : 'token') };
  let listener: (user: AuthUser | null) => void;
  const client: AuthClient = {
    subscribe: (callback) => { listener = callback; queueMicrotask(() => callback(signedIn ? currentUser : null)); return () => {}; },
    signIn: vi.fn(async () => {}), signOut: vi.fn(async () => listener(null)),
  };
  const fetcher = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const path = String(url);
    if (path === '/api/admin/me') return response({ uid: 'admin', email: 'admin@example.test', emailVerified: true, admin: true });
    if (override) return override(path, options);
    if (path === '/api/admin/competitions') return response({ competitions });
    if (path.endsWith('/units')) return response({ units: [{ id: '11', name: 'Unit' }] });
    if (path.endsWith('/categories')) return response({ categories: [{ id: '12', name: 'Category' }] });
    if (path.endsWith('/madrasas')) return response({ madrasas: [{ id: '13', name: 'Madrassa' }, { id: '14', name: 'Madrassa 2' }] });
    if (path.endsWith('/events')) return response({ events: [] });
    throw new Error('Unexpected path');
  });
  render(<MemoryRouter initialEntries={[path]}><AppRoutes client={client} fetcher={fetcher as typeof fetch} /><Probe /></MemoryRouter>);
  return { user: userEvent.setup(), fetcher, client, currentUser };
}

test('loading competitions does not assume a selection or request an overview', async () => {
  let resolve!: (value: Response) => void;
  const { fetcher } = setup('/admin', () => new Promise((done) => { resolve = done; }));
  await screen.findByText('Loading competitions…');
  expect(screen.queryByRole('combobox')).toBeNull();
  await waitFor(() => expect(resolve).toBeTypeOf('function'));
  await act(async () => resolve(response({ competitions })));
  await screen.findByRole('combobox', { name: 'Competition' });
  expect(screen.getByRole('heading', { name: 'Select a competition' })).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('multiple active and historical competitions can be selected; counts include zero', async () => {
  const { user, fetcher } = setup();
  const picker = await screen.findByRole('combobox', { name: 'Competition' });
  expect(within(picker).getAllByRole('option')).toHaveLength(4);
  await user.selectOptions(picker, '2');
  await screen.findByRole('heading', { name: competitions[1].name });
  await waitFor(() => expect(screen.getByText('Madrassas').nextElementSibling?.textContent).toBe('2'));
  expect(screen.getByText('Events').nextElementSibling?.textContent).toBe('0');
  expect(screen.getByTestId('location').textContent).toBe('/admin?competition=2');
  expect(fetcher).toHaveBeenCalledWith('/api/admin/competitions/2/units', expect.objectContaining({ headers: { Authorization: 'Bearer token', Accept: 'application/json' }, cache: 'no-store', signal: expect.any(AbortSignal) }));
  await user.selectOptions(picker, '3');
  await screen.findByRole('heading', { name: competitions[2].name });
  expect(screen.getByText('archived')).toBeTruthy();
});

test('deep links, placeholders, mobile navigation and browser history retain selection', async () => {
  const { user } = setup('/admin?competition=3');
  await screen.findByRole('heading', { name: competitions[2].name });
  await user.click(screen.getByRole('button', { name: 'Menu' }));
  expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('true');
  for (const label of ['Competitions', 'Units & Madrassas', 'Categories & Events', 'Results', 'Settings']) {
    await user.click(screen.getByRole('link', { name: label }));
    await screen.findByRole('heading', { name: label });
    expect(screen.getByText('Coming later')).toBeTruthy();
    expect(screen.getByText(competitions[2].name)).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toContain('?competition=3');
  }
  await user.click(screen.getByRole('link', { name: 'Dashboard' }));
  await screen.findByRole('heading', { name: competitions[2].name });
  await user.selectOptions(screen.getByRole('combobox'), '2');
  await user.click(screen.getByRole('button', { name: 'Go back' }));
  await screen.findByRole('heading', { name: competitions[2].name });
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('3');
});

test('empty competitions and unknown selection never fetch nested lists', async () => {
  const { fetcher } = setup('/admin?competition=999', async () => response({ competitions: [] }));
  await screen.findByRole('heading', { name: 'No competitions yet' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  cleanup();
  const second = setup('/admin?competition=999');
  await screen.findByRole('heading', { name: 'Competition unavailable' });
  expect(second.fetcher).toHaveBeenCalledTimes(2);
});

test('list network error and malformed data have a safe retry state', async () => {
  let attempt = 0;
  const { user } = setup('/admin', async () => {
    attempt++;
    if (attempt === 1) throw new Error('sensitive detail');
    return response(attempt === 2 ? { competitions: [{ id: 1 }] } : { competitions });
  });
  await screen.findByRole('alert');
  expect(document.body.textContent).not.toContain('sensitive detail');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('alert');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('combobox');
});

test('overview failure never displays partial counts and can be retried', async () => {
  let fail = true;
  const { user } = setup('/admin?competition=1', async (path) => {
    if (path === '/api/admin/competitions') return response({ competitions });
    if (fail) return response({}, 500);
    return response(path.endsWith('/units') ? { units: [] } : { categories: [] });
  });
  await screen.findByRole('alert');
  expect(screen.queryByText('Madrassas')).toBeNull();
  fail = false;
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByText('Units').nextElementSibling?.textContent).toBe('0'));
});

test('late responses from an old selection cannot override the current overview', async () => {
  const pending: Array<(value: Response) => void> = [];
  const { user } = setup('/admin?competition=1', async (path) => {
    if (path === '/api/admin/competitions') return response({ competitions });
    if (path.includes('/1/')) return new Promise((resolve) => pending.push(resolve));
    return response(path.endsWith('/units') ? { units: [] } : { categories: [] });
  });
  await screen.findByText('Loading competition overview…');
  await user.selectOptions(screen.getByRole('combobox'), '2');
  await waitFor(() => expect(screen.getByText('Units').nextElementSibling?.textContent).toBe('0'));
  await act(async () => { pending[0](response({ units: [{ id: '5', name: 'Old unit' }] })); pending[1](response({ categories: [] })); });
  expect(screen.getByRole('heading', { name: competitions[1].name })).toBeTruthy();
  expect(screen.getByText('Units').nextElementSibling?.textContent).toBe('0');
});

test.each([401, 403])('protected data status %s removes dashboard access', async (status) => {
  const { fetcher, currentUser } = setup('/admin', async () => response({}, status));
  await screen.findByRole('heading', { name: status === 401 ? 'Sign in' : 'Access denied' });
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(fetcher.mock.calls.filter(([url]) => url === '/api/admin/competitions')).toHaveLength(status === 401 ? 2 : 1);
  if (status === 401) expect(currentUser.getIdToken).toHaveBeenCalledWith(true);
});

test('a refreshed token recovers an expired data request', async () => {
  let attempt = 0;
  const { currentUser } = setup('/admin', async () => ++attempt === 1 ? response({}, 401) : response({ competitions }));
  await screen.findByRole('combobox');
  expect(currentUser.getIdToken).toHaveBeenCalledWith(true);
});

test('unauthenticated deep links never request admin data', async () => {
  const { fetcher } = setup('/admin/settings?competition=3', undefined, false);
  await screen.findByRole('heading', { name: 'Sign in' });
  expect(fetcher).not.toHaveBeenCalled();
});

test('expired Firebase token retrieval removes dashboard without sending a protected request', async () => {
  const { currentUser, fetcher, user } = setup();
  await screen.findByRole('combobox');
  vi.mocked(currentUser.getIdToken).mockRejectedValue({ code: 'auth/user-token-expired' });
  await user.selectOptions(screen.getByRole('combobox'), '1');
  await screen.findByRole('heading', { name: 'Sign in' });
  expect(fetcher.mock.calls.some(([path]) => String(path).includes('/1/units'))).toBe(false);
});

test('logout failure removes protected content and provides an access recovery path', async () => {
  const { client, user } = setup();
  await screen.findByRole('combobox');
  vi.mocked(client.signOut).mockRejectedValue(new Error('private signout detail'));
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('heading', { name: 'Admin access unavailable' });
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(document.body.textContent).not.toContain('private signout detail');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('combobox');
});
