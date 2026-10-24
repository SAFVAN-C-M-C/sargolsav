import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AppRoutes } from './App';
import type { AuthClient, AuthUser } from './auth/firebaseClient';

afterEach(cleanup);

function firebaseUser(uid = 'admin-uid'): AuthUser {
  return { uid, email: 'admin@example.test', getIdToken: vi.fn(async () => 'opaque-id-token') };
}

function apiResponse(status: number, uid = 'admin-uid'): Response {
  return {
    status, ok: status >= 200 && status < 300,
    json: async () => ({ uid, email: 'admin@example.test', emailVerified: true, admin: true }),
  } as Response;
}

class FakeAuthClient implements AuthClient {
  private listener?: (user: AuthUser | null) => void;
  signInUser: AuthUser | null = null;
  signInError: unknown;
  signInCalls: Array<[string, string]> = [];
  signOutCalls = 0;
  subscribeCalls = 0;

  constructor(private initial: AuthUser | null | undefined) {}

  subscribe(listener: (user: AuthUser | null) => void) {
    this.subscribeCalls += 1;
    this.listener = listener;
    if (this.initial !== undefined) queueMicrotask(() => this.emit(this.initial ?? null));
    return () => { this.listener = undefined; };
  }

  emit(user: AuthUser | null) {
    this.listener?.(user);
  }

  async signIn(email: string, password: string) {
    this.signInCalls.push([email, password]);
    if (this.signInError) throw this.signInError;
    this.emit(this.signInUser);
  }

  async signOut() {
    this.signOutCalls += 1;
    this.emit(null);
  }
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderApp(path: string, client: AuthClient, fetcher = vi.fn().mockResolvedValue(apiResponse(200))) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes client={client} fetcher={fetcher as unknown as typeof fetch} />
      <LocationProbe />
    </MemoryRouter>,
  );
  return { fetcher, user: userEvent.setup() };
}

test('public home is accessible without starting Firebase authentication', async () => {
  const client = new FakeAuthClient(undefined);
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ competitions: [] }) });
  renderApp('/', client, fetcher);
  expect(await screen.findByRole('heading', { name: 'No active competition' })).toBeTruthy();
  expect(client.subscribeCalls).toBe(0);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith('/api/competitions', expect.objectContaining({ headers: { Accept: 'application/json' } }));
});

test('missing authentication redirects to login and preserves the protected destination', async () => {
  const client = new FakeAuthClient(null);
  renderApp('/admin/reports?view=recent', client);
  expect(screen.getByRole('status').textContent).toContain('Checking admin access');
  await screen.findByRole('heading', { name: 'Sign in' });
  expect(screen.getByTestId('location').textContent).toBe('/admin/login');
});

test('valid admin login verifies with the backend and returns to the requested route', async () => {
  const client = new FakeAuthClient(null);
  client.signInUser = firebaseUser();
  const { fetcher, user } = renderApp('/admin/reports?view=recent', client);
  await screen.findByRole('heading', { name: 'Sign in' });
  await user.type(screen.getByLabelText('Email'), 'admin@example.test');
  await user.type(screen.getByLabelText('Password'), 'sample-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('heading', { name: 'Sargolsav admin' });
  expect(screen.getByTestId('location').textContent).toBe('/admin/reports?view=recent');
  expect(client.signInCalls).toEqual([['admin@example.test', 'sample-password']]);
  expect(fetcher).toHaveBeenCalledWith('/api/admin/me', expect.objectContaining({
    headers: { Authorization: 'Bearer opaque-id-token' },
  }));
});

test('invalid credentials show a safe message and do not reveal protected content', async () => {
  const client = new FakeAuthClient(null);
  client.signInError = { code: 'auth/invalid-credential', message: 'sensitive SDK detail' };
  const { user } = renderApp('/admin/login', client);
  await screen.findByRole('heading', { name: 'Sign in' });
  await user.type(screen.getByLabelText('Email'), 'admin@example.test');
  await user.type(screen.getByLabelText('Password'), 'wrong-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Email or password is incorrect.');
  expect(screen.queryByRole('heading', { name: 'Sargolsav admin' })).toBeNull();
  expect(document.body.textContent).not.toContain('sensitive SDK detail');
});

test('authenticated non-admin sees access denied and no dashboard', async () => {
  const client = new FakeAuthClient(firebaseUser('member-uid'));
  const fetcher = vi.fn().mockResolvedValue(apiResponse(403));
  renderApp('/admin', client, fetcher);
  await screen.findByRole('heading', { name: 'Access denied' });
  expect(screen.queryByRole('heading', { name: 'Sargolsav admin' })).toBeNull();
  expect(client.signOutCalls).toBe(0);
});

test('logout clears the protected view and returns to login', async () => {
  const client = new FakeAuthClient(firebaseUser());
  const { user } = renderApp('/admin', client);
  await screen.findByRole('heading', { name: 'Sargolsav admin' });
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('heading', { name: 'Sign in' });
  expect(client.signOutCalls).toBe(1);
  expect(screen.getByTestId('location').textContent).toBe('/admin/login');
  expect(screen.queryByRole('heading', { name: 'Sargolsav admin' })).toBeNull();
});

test('session restoration holds protected content until backend authorization completes', async () => {
  const client = new FakeAuthClient(undefined);
  let resolveResponse: ((value: Response) => void) | undefined;
  const fetcher = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  }));
  renderApp('/admin', client, fetcher);
  expect(screen.getByRole('status')).toBeTruthy();
  client.emit(firebaseUser());
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('heading', { name: 'Sargolsav admin' })).toBeNull();
  resolveResponse?.(apiResponse(200));
  await screen.findByRole('heading', { name: 'Sargolsav admin' });
});

test('backend failure shows retryable unavailable state, then restores access', async () => {
  const client = new FakeAuthClient(firebaseUser());
  const fetcher = vi.fn()
    .mockRejectedValueOnce(new Error('network detail'))
    .mockResolvedValueOnce(apiResponse(200));
  const { user } = renderApp('/admin', client, fetcher);
  await screen.findByRole('heading', { name: 'Admin access unavailable' });
  expect(screen.queryByRole('heading', { name: 'Sargolsav admin' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('heading', { name: 'Sargolsav admin' });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('backend 401 after refresh signs out, while verified admins leave login', async () => {
  const client = new FakeAuthClient(firebaseUser());
  const fetcher = vi.fn().mockResolvedValue(apiResponse(401));
  renderApp('/admin', client, fetcher);
  await screen.findByRole('heading', { name: 'Sign in' });
  expect(client.signOutCalls).toBe(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  cleanup();

  const restored = new FakeAuthClient(firebaseUser());
  renderApp('/admin/login', restored);
  await screen.findByRole('heading', { name: 'Sargolsav admin' });
  expect(screen.getByTestId('location').textContent).toBe('/admin');
});
