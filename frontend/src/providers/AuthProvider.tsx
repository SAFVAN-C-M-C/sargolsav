import { ADMIN_REFRESH_INTERVAL } from '../constants/auth';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { checkAdminAccess, isInvalidSession } from '../api/adminApi';
import { firebaseAuthClient } from '../lib/firebaseClient';
import type { AdminRequestOptions, AuthClient, AuthUser } from '../types/auth';
import { AdminApiError } from '../api/adminErrors';
import { AuthContext } from '../contexts/authContext';
import type { AuthState } from '../types/auth';

export function AuthProvider({ children, client = firebaseAuthClient, fetcher = fetch }: {
  children: ReactNode;
  client?: AuthClient;
  fetcher?: typeof fetch;
}) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const userRef = useRef<AuthUser | null>(null);
  const sessionRef = useRef(0);
  const checkRef = useRef<{ sequence: number; controller?: AbortController }>({ sequence: 0 });

  const check = useCallback((user: AuthUser | null, forceRefresh = false) => {
    checkRef.current.controller?.abort();
    const sequence = ++checkRef.current.sequence;
    if (!user) {
      setState({ status: 'unauthenticated' });
      return;
    }

    const controller = new AbortController();
    checkRef.current.controller = controller;
    // Background verification must not unmount unsaved management forms.
    setState((previous) => previous.status === 'authorized' && previous.identity.uid === user.uid ? previous : { status: 'loading' });
    void checkAdminAccess(user, { forceRefresh, signal: controller.signal, fetcher })
      .then((result) => {
        if (controller.signal.aborted || sequence !== checkRef.current.sequence) return;
        if (result.status !== 'authorized') sessionRef.current += 1;
        if (result.status === 'unauthenticated') {
          setState(result);
          void client.signOut().catch(() => {});
        } else {
          setState(result);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && sequence === checkRef.current.sequence) {
          sessionRef.current += 1;
          setState({ status: 'unavailable' });
        }
      });
  }, [client, fetcher]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const currentCheck = checkRef.current;
    try {
      unsubscribe = client.subscribe((user) => {
        if (userRef.current !== user) sessionRef.current += 1;
        userRef.current = user;
        check(user);
      });
    } catch {
      queueMicrotask(() => {
        if (active) setState({ status: 'unavailable' });
      });
    }
    return () => {
      active = false;
      unsubscribe?.();
      currentCheck.controller?.abort();
      currentCheck.sequence += 1;
      sessionRef.current += 1;
    };
  }, [client, check]);

  useEffect(() => {
    const refresh = () => {
      if (userRef.current) check(userRef.current);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const timer = window.setInterval(refresh, ADMIN_REFRESH_INTERVAL);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  const login = useCallback(async (email: string, password: string) => {
    setState({ status: 'loading' });
    try {
      await client.signIn(email, password);
    } catch (error) {
      setState({ status: 'unauthenticated' });
      throw error;
    }
  }, [client]);

  const logout = useCallback(async () => {
    checkRef.current.controller?.abort();
    checkRef.current.sequence += 1;
    sessionRef.current += 1;
    setState({ status: 'loading' });
    try {
      await client.signOut();
      userRef.current = null;
      setState({ status: 'unauthenticated' });
    } catch (error) {
      setState({ status: 'unavailable' });
      throw error;
    }
  }, [client]);

  const retry = useCallback(() => {
    if (userRef.current) check(userRef.current, true);
    else window.location.reload();
  }, [check]);

  const request = useCallback(async (path: string, signal: AbortSignal, options?: AdminRequestOptions): Promise<unknown> => {
    const user = userRef.current;
    if (!user || state.status !== 'authorized' || !path.startsWith('/api/admin/')) {
      throw new Error('Admin access required');
    }
    const session = sessionRef.current;
    const current = () => !signal.aborted && userRef.current === user && session === sessionRef.current;
    const send = async (refresh: boolean) => {
      const token = await user.getIdToken(refresh);
      signal.throwIfAborted();
      if (!current()) throw new Error('Session changed');
      return fetcher(path, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(options && options.method !== 'DELETE' ? { 'Content-Type': 'application/json' } : {}) },
        ...(options ? { method: options.method, ...(options.method !== 'DELETE' ? { body: JSON.stringify(options.body) } : {}) } : {}),
        cache: 'no-store', signal,
      });
    };
    try {
      let response = await send(false);
      if (response.status === 401 && current()) response = await send(true);
      if (!current()) throw new Error('Session changed');
      if (response.status === 401 || response.status === 403) {
        sessionRef.current += 1;
        checkRef.current.sequence += 1;
        setState({ status: response.status === 401 ? 'unauthenticated' : 'forbidden' });
        if (response.status === 401) void client.signOut().catch(() => {});
      }
      if (!response.ok) {
        let message = 'Admin request failed. Please try again.';
        if ([400, 404, 409, 413].includes(response.status)) {
          const body: unknown = await response.json().catch(() => null);
          if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') message = body.error;
        }
        throw new AdminApiError(response.status, message);
      }
      return response.status === 204 ? undefined : await response.json();
    } catch (error) {
      if (current() && isInvalidSession(error)) {
        sessionRef.current += 1;
        checkRef.current.sequence += 1;
        setState({ status: 'unauthenticated' });
        void client.signOut().catch(() => {});
      }
      throw error;
    }
  }, [client, fetcher, state.status]);

  return (
    <AuthContext.Provider value={{ state, login, logout, retry, request }}>
      {children}
    </AuthContext.Provider>
  );
}
