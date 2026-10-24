import { BrowserRouter, Link, Outlet, Route, Routes } from 'react-router-dom';
import { AdminDashboard, AdminLogin, RequireAdmin } from './auth/AdminPages';
import { AuthProvider } from './auth/AuthProvider';
import { firebaseAuthClient } from './auth/firebaseClient';
import type { AuthClient } from './auth/firebaseClient';

function PublicHome() {
  return (
    <main>
      <p className="eyebrow">Zonal Madrassa Cultural Competition</p>
      <h1>sargolsav</h1>
      <p>The home for competition results.</p>
      <p className="notice">Project foundation ready. Results features are coming in future tickets.</p>
      <Link className="back-link" to="/admin">Admin sign in</Link>
    </main>
  );
}

function AdminShell({ client, fetcher }: { client: AuthClient; fetcher: typeof fetch }) {
  return <AuthProvider client={client} fetcher={fetcher}><main className="admin-main"><Outlet /></main></AuthProvider>;
}

export function AppRoutes({ client = firebaseAuthClient, fetcher = fetch }: {
  client?: AuthClient;
  fetcher?: typeof fetch;
}) {
  return (
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/admin" element={<AdminShell client={client} fetcher={fetcher} />}>
        <Route path="login" element={<AdminLogin />} />
        <Route element={<RequireAdmin />}>
          <Route index element={<AdminDashboard />} />
          <Route path="*" element={<AdminDashboard />} />
        </Route>
      </Route>
      <Route path="*" element={<main><h1>Page not found</h1><Link to="/">Public home</Link></main>} />
    </Routes>
  );
}

export default function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>;
}
