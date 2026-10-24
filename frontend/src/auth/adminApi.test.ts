import { describe, expect, test, vi } from 'vitest';
import { checkAdminAccess } from './adminApi';
import type { AuthUser } from './firebaseClient';

function response(status: number, body?: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

function user() {
  return {
    uid: 'verified-uid', email: 'admin@example.test',
    getIdToken: vi.fn(async (forceRefresh?: boolean) => forceRefresh ? 'fresh-token' : 'stale-token'),
  } satisfies AuthUser;
}

describe('backend admin authorization', () => {
  test('uses a Firebase token and retries a 401 once with a forced refresh', async () => {
    const currentUser = user();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, {
        uid: 'verified-uid', email: 'admin@example.test', emailVerified: true, admin: true,
      })) as unknown as typeof fetch;
    const result = await checkAdminAccess(currentUser, { fetcher });
    expect(result.status).toBe('authorized');
    expect(currentUser.getIdToken).toHaveBeenNthCalledWith(1, false);
    expect(currentUser.getIdToken).toHaveBeenNthCalledWith(2, true);
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/admin/me', expect.objectContaining({
      headers: { Authorization: 'Bearer stale-token' }, cache: 'no-store',
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/admin/me', expect.objectContaining({
      headers: { Authorization: 'Bearer fresh-token' }, cache: 'no-store',
    }));
  });

  test('a second 401 invalidates the session; 403 is distinct', async () => {
    const currentUser = user();
    const denied = vi.fn().mockResolvedValue(response(401)) as unknown as typeof fetch;
    expect(await checkAdminAccess(currentUser, { fetcher: denied })).toEqual({ status: 'unauthenticated' });
    expect(denied).toHaveBeenCalledTimes(2);
    const forbidden = vi.fn().mockResolvedValue(response(403)) as unknown as typeof fetch;
    expect(await checkAdminAccess(currentUser, { fetcher: forbidden })).toEqual({ status: 'forbidden' });
    expect(forbidden).toHaveBeenCalledTimes(1);
  });

  test('network failure and malformed identity never authorize', async () => {
    const currentUser = user();
    const network = vi.fn().mockRejectedValue(new Error('network detail')) as unknown as typeof fetch;
    expect(await checkAdminAccess(currentUser, { fetcher: network })).toEqual({ status: 'unavailable' });
    const wrongUid = vi.fn().mockResolvedValue(response(200, {
      uid: 'other-uid', email: null, emailVerified: false, admin: true,
    })) as unknown as typeof fetch;
    expect(await checkAdminAccess(currentUser, { fetcher: wrongUid })).toEqual({ status: 'unavailable' });
  });

  test('explicit retry forces a token refresh immediately', async () => {
    const currentUser = user();
    const fetcher = vi.fn().mockResolvedValue(response(403)) as unknown as typeof fetch;
    await checkAdminAccess(currentUser, { fetcher, forceRefresh: true });
    expect(currentUser.getIdToken).toHaveBeenCalledTimes(1);
    expect(currentUser.getIdToken).toHaveBeenCalledWith(true);
  });

  test('token retrieval failures distinguish an invalid session from a temporary failure', async () => {
    const currentUser = user();
    const fetcher = vi.fn() as unknown as typeof fetch;
    currentUser.getIdToken.mockRejectedValueOnce({ code: 'auth/user-token-expired' });
    expect(await checkAdminAccess(currentUser, { fetcher })).toEqual({ status: 'unauthenticated' });
    currentUser.getIdToken.mockRejectedValueOnce(new Error('temporary token service failure'));
    expect(await checkAdminAccess(currentUser, { fetcher })).toEqual({ status: 'unavailable' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
