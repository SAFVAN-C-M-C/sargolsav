import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import type { PublicApi } from '../types/publicApi';

export function PublicLayout({ api }: { api: PublicApi }) {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname) {
      main.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      previousPath.current = pathname;
    }
  }, [pathname]);
  return <div className="public-app">
    <a className="skip-link" href="#public-content">Skip to content</a>
    <header className="public-header"><Link className="brand" to="/" aria-label="Sargolsav home">
      <span className="brand-symbol" aria-hidden="true">✦</span><span>sargolsav<span className="brand-caption">CULTURE · COMMUNITY · EXCELLENCE</span></span>
    </Link><span className="header-note">Zonal Madrassa<br />Cultural Competition</span></header>
    <main ref={main} id="public-content" className="public-main" tabIndex={-1}>
      <Outlet context={api} />
    </main>
    <footer className="public-footer"><span>Celebrating talent. Bringing us together.</span><Link to="/admin/login">Admin sign in</Link></footer>
  </div>;
}
