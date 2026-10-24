import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';

export function LoadingPanel() {
  return <div className="status-card" role="status">Checking admin access…</div>;
}

export function AccessDenied() {
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

export function AuthUnavailable() {
  const { retry } = useAdminAuth();
  return (
    <div className="status-card" role="alert">
      <h2>Admin access unavailable</h2>
      <p>We could not confirm your access. Check your connection or Firebase configuration, then try again.</p>
      <button type="button" onClick={retry}>Try again</button>
    </div>
  );
}
