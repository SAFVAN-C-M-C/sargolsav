import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminLogin } from './pages/admin/AdminLogin';
import { RequireAdmin } from './components/admin/RequireAdmin';
import { AuthProvider } from './providers/AuthProvider';
import { firebaseAuthClient } from './lib/firebaseClient';
import type { AuthClient } from './types/auth';
import { PublicApp } from './routes/PublicApp';

function AdminShell({ client, fetcher }: { client: AuthClient; fetcher: typeof fetch }) {
  return <AuthProvider client={client} fetcher={fetcher}><main className="admin-main"><Outlet /></main></AuthProvider>;
}

export function AppRoutes({ client = firebaseAuthClient, fetcher = fetch }: {
  client?: AuthClient;
  fetcher?: typeof fetch;
}) {
  return (
    <Routes>
      <Route path="/admin" element={<AdminShell client={client} fetcher={fetcher} />}>
        <Route path="login" element={<AdminLogin />} />
        <Route element={<RequireAdmin />}>
          <Route index element={<AdminDashboard />} />
          <Route path="*" element={<AdminDashboard />} />
        </Route>
      </Route>
      <Route path="/*" element={<PublicApp fetcher={fetcher} />} />
    </Routes>
  );
}

export default function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>;
}
