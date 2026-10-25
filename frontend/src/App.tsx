import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminLogin } from './pages/admin/AdminLogin';
import { RequireAdmin } from './components/admin/RequireAdmin';
import { AuthProvider } from './providers/AuthProvider';
import { firebaseAuthClient } from './lib/firebaseClient';
import type { AuthClient } from './types/auth';
import { PublicApp } from './routes/PublicApp';
import { AdminLayout } from './layouts/AdminLayout';
import { adminDestinations } from './constants/adminNavigation';
import { AdminPlaceholder } from './pages/admin/AdminPlaceholder';
import { AdminCompetitions } from './pages/admin/AdminCompetitions';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminUnits } from './pages/admin/AdminUnits';

function AdminShell({ client, fetcher }: { client: AuthClient; fetcher: typeof fetch }) {
  return <AuthProvider client={client} fetcher={fetcher}><div className="admin-auth-shell"><Outlet /></div></AuthProvider>;
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
          <Route element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="competitions" element={<AdminCompetitions />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="units" element={<AdminUnits />} />
            {adminDestinations.filter(([path]) => path && path !== 'competitions' && path !== 'settings' && path !== 'units').map(([path, title]) => <Route key={path} path={path} element={<AdminPlaceholder title={title} />} />)}
            <Route path="*" element={<AdminPlaceholder title="Admin page not found" />} />
          </Route>
        </Route>
      </Route>
      <Route path="/*" element={<PublicApp fetcher={fetcher} />} />
    </Routes>
  );
}

export default function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>;
}
