import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';

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
