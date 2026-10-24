import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from './authContext';
import { loginErrorMessage } from './authErrors';

function requestedDestination(value: unknown): string {
  if (typeof value !== 'string' || !/^\/admin(?:\/|\?|#|$)/.test(value) ||
      /^\/admin\/login(?:\/|\?|#|$)/.test(value)) return '/admin';
  return value;
}

function LoadingPanel() {
  return <div className="status-card" role="status">Checking admin access…</div>;
}

function AccessDenied() {
  const { retry, logout } = useAdminAuth();
  const [logoutError, setLogoutError] = useState(false);
  const navigate = useNavigate();
  const leave = async () => {
    try {
      await logout();
      navigate('/admin/login', { replace: true });
    } catch {
      setLogoutError(true);
    }
  };
  return (
    <div className="status-card" role="alert">
      <h2>Access denied</h2>
      <p>This account is signed in, but it does not have admin access.</p>
      <div className="actions">
        <button type="button" onClick={retry}>Check access again</button>
        <button className="button-secondary" type="button" onClick={() => void leave()}>Sign out</button>
      </div>
      {logoutError && <p className="form-error">Could not sign out. Please try again.</p>}
    </div>
  );
}

function AuthUnavailable() {
  const { retry } = useAdminAuth();
  return (
    <div className="status-card" role="alert">
      <h2>Admin access unavailable</h2>
      <p>We could not confirm your access. Check your connection or Firebase configuration, then try again.</p>
      <button type="button" onClick={retry}>Try again</button>
    </div>
  );
}

export function RequireAdmin() {
  const { state } = useAdminAuth();
  const location = useLocation();
  if (state.status === 'loading') return <LoadingPanel />;
  if (state.status === 'unauthenticated') {
    const from = location.pathname + location.search + location.hash;
    return <Navigate to="/admin/login" replace state={{ from }} />;
  }
  if (state.status === 'forbidden') return <AccessDenied />;
  if (state.status === 'unavailable') return <AuthUnavailable />;
  return <Outlet />;
}

export function AdminLogin() {
  const { state, login } = useAdminAuth();
  const location = useLocation();
  const from = requestedDestination((location.state as { from?: unknown } | null)?.from);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (state.status === 'loading') return <LoadingPanel />;
  if (state.status === 'authorized') return <Navigate to={from} replace />;
  if (state.status === 'forbidden') return <AccessDenied />;
  if (state.status === 'unavailable') return <AuthUnavailable />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (cause) {
      setError(loginErrorMessage(cause));
      setSubmitting(false);
    }
  };

  return (
    <section className="login-card" aria-labelledby="login-title">
      <p className="eyebrow">Admin access</p>
      <h1 id="login-title">Sign in</h1>
      <p>Use your authorized Firebase account to manage Sargolsav.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="admin-email">Email</label>
        <input id="admin-email" type="email" autoComplete="username" required
          value={email} onChange={(event) => setEmail(event.target.value)} />
        <label htmlFor="admin-password">Password</label>
        <input id="admin-password" type="password" autoComplete="current-password" required
          value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <Link className="back-link" to="/">Back to public home</Link>
    </section>
  );
}

export function AdminDashboard() {
  const { state, logout } = useAdminAuth();
  const [logoutError, setLogoutError] = useState(false);
  const navigate = useNavigate();
  const leave = async () => {
    try {
      await logout();
      navigate('/admin/login', { replace: true });
    } catch {
      setLogoutError(true);
    }
  };
  if (state.status !== 'authorized') return null;
  return (
    <section className="admin-card" aria-labelledby="admin-title">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Admin workspace</p>
          <h1 id="admin-title">Sargolsav admin</h1>
        </div>
        <button className="button-secondary" type="button" onClick={() => void leave()}>Sign out</button>
      </div>
      <p>Signed in as {state.identity.email ?? state.identity.uid}.</p>
      <p className="notice">Competition management will be available in a future ticket.</p>
      {logoutError && <p className="form-error" role="alert">Could not sign out. Please try again.</p>}
      <Link className="back-link" to="/">Public home</Link>
    </section>
  );
}
