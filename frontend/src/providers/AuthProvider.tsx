import { ADMIN_REFRESH_INTERVAL } from '../constants/auth';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { checkAdminAccess } from '../api/adminApi';
import { firebaseAuthClient } from '../lib/firebaseClient';
import type { AuthClient, AuthUser } from '../types/auth';
import { AuthContext } from '../contexts/authContext';
import type { AuthState } from '../types/auth';

export function AuthProvider({ children, client = firebaseAuthClient, fetcher = fetch }: {
  children: ReactNode;
  client?: AuthClient;
  fetcher?: typeof fetch;
}) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const userRef = useRef<AuthUser | null>(null);
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
    setState({ status: 'loading' });
    void checkAdminAccess(user, { forceRefresh, signal: controller.signal, fetcher })
      .then((result) => {
        if (controller.signal.aborted || sequence !== checkRef.current.sequence) return;
        if (result.status === 'unauthenticated') {
          setState(result);
          void client.signOut().catch(() => {});
        } else {
          setState(result);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && sequence === checkRef.current.sequence) {
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

  return (
    <AuthContext.Provider value={{ state, login, logout, retry }}>
      {children}
    </AuthContext.Provider>
  );
}
