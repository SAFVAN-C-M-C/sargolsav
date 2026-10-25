import { BrandLink, BrandLogoImg, HeaderLogoImg, PublicAppDiv, PublicFooterFooter, PublicHeaderHeader, PublicMainMain, SkipLinkA } from '../styles/components';
import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
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
  return <PublicAppDiv>
    <SkipLinkA href="#public-content">Skip to content</SkipLinkA>
    <PublicHeaderHeader><BrandLink to="/" aria-label="Sargolsav home">
      <BrandLogoImg src="/images/MSM_LOGO.png" alt="MSM logo" width={827} height={414} />
    </BrandLink><HeaderLogoImg src="/images/MSM_LOGO.png" alt="MSM logo" width={827} height={414} /></PublicHeaderHeader>
    <PublicMainMain ref={main} id="public-content" tabIndex={-1}>
      <Outlet context={api} />
    </PublicMainMain>
    <PublicFooterFooter><span>A product form SAFVAN</span><span>MSM TIRUR ZONE</span></PublicFooterFooter>
  </PublicAppDiv>;
}
