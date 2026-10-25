import { BackLinkLink, AppButton, EyebrowP, FormErrorP, AppForm, FormInput, FieldLabel, LoginCardSection } from '../../styles/components';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { loginErrorMessage } from '../../utils/authErrors';
import { requestedDestination } from '../../utils/adminPaths';
import { LoadingPanel, AccessDenied, AuthUnavailable } from '../../components/admin/AuthStates';

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
    <LoginCardSection aria-labelledby="login-title">
      <EyebrowP>Admin access</EyebrowP>
      <h1 id="login-title">Sign in</h1>
      <p>Use your authorized Firebase account to manage Sargolsav.</p>
      <AppForm onSubmit={(event) => void submit(event)}>
        <FieldLabel htmlFor="admin-email">Email</FieldLabel>
        <FormInput id="admin-email" type="email" autoComplete="username" required
          value={email} onChange={(event) => setEmail(event.target.value)} />
        <FieldLabel htmlFor="admin-password">Password</FieldLabel>
        <FormInput id="admin-password" type="password" autoComplete="current-password" required
          value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <FormErrorP role="alert">{error}</FormErrorP>}
        <AppButton type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </AppButton>
      </AppForm>
      <BackLinkLink to="/">Back to public home</BackLinkLink>
    </LoginCardSection>
  );
}
