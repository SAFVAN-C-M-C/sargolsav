import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { LoadingPanel, AccessDenied, AuthUnavailable } from './AuthStates';

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
