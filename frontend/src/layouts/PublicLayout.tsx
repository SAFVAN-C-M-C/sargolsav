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
      <img className="brand-logo" src="/images/MSM_LOGO.png" alt="MSM logo" width={827} height={414} />
    </Link><img className="header-logo" src="/images/MSM_LOGO.png" alt="MSM logo" width={827} height={414} /></header>
    <main ref={main} id="public-content" className="public-main" tabIndex={-1}>
      <Outlet context={api} />
    </main>
    <footer className="public-footer"><span>A product form SAFVAN</span><span>MSM TIRUR ZONE</span></footer>
  </div>;
}
