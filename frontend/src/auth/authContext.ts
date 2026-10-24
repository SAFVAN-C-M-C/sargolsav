import { createContext, useContext } from 'react';
import type { AdminIdentity } from './adminApi';

export type AuthState =
  | { status: 'loading' | 'unauthenticated' | 'forbidden' | 'unavailable' }
  | { status: 'authorized'; identity: AdminIdentity };

export interface AuthContextValue {
  state: AuthState;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  retry(): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAdminAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAdminAuth must be used inside AuthProvider');
  return context;
}
