import type { AdminIdentity, AdminAccess } from '../types/admin';
import { INVALID_SESSION_CODES } from '../constants/auth';
import type { AuthUser } from '../types/auth';

export function isInvalidSession(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    INVALID_SESSION_CODES.has(String(error.code));
}

function isAdminIdentity(value: unknown, uid: string): value is AdminIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.uid === uid && candidate.admin === true &&
    (typeof candidate.email === 'string' || candidate.email === null) &&
    typeof candidate.emailVerified === 'boolean';
}

export async function checkAdminAccess(
  user: AuthUser,
  { forceRefresh = false, signal, fetcher = fetch }: {
    forceRefresh?: boolean;
    signal?: AbortSignal;
    fetcher?: typeof fetch;
  } = {},
): Promise<AdminAccess> {
  const request = async (refresh: boolean) => {
    const token = await user.getIdToken(refresh);
    return fetcher('/api/admin/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal,
    });
  };

  try {
    let response = await request(forceRefresh);
    if (response.status === 401 && !forceRefresh) response = await request(true);
    if (response.status === 401) return { status: 'unauthenticated' };
    if (response.status === 403) return { status: 'forbidden' };
    if (!response.ok) return { status: 'unavailable' };
    const body: unknown = await response.json();
    if (!isAdminIdentity(body, user.uid)) return { status: 'unavailable' };
    return { status: 'authorized', identity: body };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: isInvalidSession(error) ? 'unauthenticated' : 'unavailable' };
  }
}
