import { Outlet, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminLogin } from './pages/admin/AdminLogin';
import { RequireAdmin } from './components/admin/RequireAdmin';
import { AuthProvider } from './providers/AuthProvider';
import { firebaseAuthClient } from './lib/firebaseClient';
import type { AuthClient } from './types/auth';
import { PublicApp } from './routes/PublicApp';
import { AdminLayout } from './layouts/AdminLayout';
import { AdminPlaceholder } from './pages/admin/AdminPlaceholder';
import { AdminCompetitions } from './pages/admin/AdminCompetitions';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminUnits } from './pages/admin/AdminUnits';
import { AdminCategories } from './pages/admin/AdminCategories';

const AdminResults = lazy(() => import('./pages/admin/AdminResults').then((module) => ({ default: module.AdminResults })));

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
            <Route path="categories" element={<AdminCategories />} />
            <Route path="results" element={<Suspense fallback={<div className="dashboard-panel" role="status">Loading results…</div>}><AdminResults /></Suspense>} />
            <Route path="*" element={<AdminPlaceholder title="Admin page not found" />} />
          </Route>
        </Route>
      </Route>
      <Route path="/*" element={<PublicApp fetcher={fetcher} />} />
    </Routes>
  );
}

export default function App() {
  return <AppRoutes />;
}
