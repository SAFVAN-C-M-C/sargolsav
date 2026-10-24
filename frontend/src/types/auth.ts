import type { User } from 'firebase/auth';
import type { AdminIdentity } from './admin';

export type AuthUser = Pick<User, 'uid' | 'email' | 'getIdToken'>;

export interface AuthClient {
  subscribe(listener: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

export type AuthState =
  | { status: 'loading' | 'unauthenticated' | 'forbidden' | 'unavailable' }
  | { status: 'authorized'; identity: AdminIdentity };

export interface AuthContextValue {
  state: AuthState;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  retry(): void;
}

