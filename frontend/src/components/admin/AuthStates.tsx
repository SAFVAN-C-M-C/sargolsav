import { ActionsDiv, AppButton, ButtonSecondaryButton, FormErrorP, StatusCardDiv } from '../../styles/components';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';

export function LoadingPanel() {
  return <StatusCardDiv role="status">Checking admin access…</StatusCardDiv>;
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
    <StatusCardDiv role="alert">
      <h2>Access denied</h2>
      <p>This account is signed in, but it does not have admin access.</p>
      <ActionsDiv>
        <AppButton type="button" onClick={retry}>Check access again</AppButton>
        <ButtonSecondaryButton type="button" onClick={() => void leave()}>Sign out</ButtonSecondaryButton>
      </ActionsDiv>
      {logoutError && <FormErrorP>Could not sign out. Please try again.</FormErrorP>}
    </StatusCardDiv>
  );
}

export function AuthUnavailable() {
  const { retry } = useAdminAuth();
  return (
    <StatusCardDiv role="alert">
      <h2>Admin access unavailable</h2>
      <p>We could not confirm your access. Check your connection or Firebase configuration, then try again.</p>
      <AppButton type="button" onClick={retry}>Try again</AppButton>
    </StatusCardDiv>
  );
}
