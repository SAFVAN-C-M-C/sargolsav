import { AppButton, LoadingCardsDiv, PublicStateSection, LoadingSkeleton, SrOnlySpan, StateMarkSpan } from '../../styles/components';
export function LoadingCards({ label = 'Loading competitions and categories' }: { label?: string }) {
  return <LoadingCardsDiv role="status" aria-label={label}>
    <SrOnlySpan>{label}…</SrOnlySpan>
    {[1, 2, 3].map((key) => <LoadingSkeleton aria-hidden="true" key={key} />)}
  </LoadingCardsDiv>;
}

export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return <PublicStateSection><StateMarkSpan aria-hidden="true">◇</StateMarkSpan>
    <h2>{title}</h2><p>{children}</p></PublicStateSection>;
}

export function ErrorState({ retry }: { retry: () => void }) {
  return <PublicStateSection role="alert"><h2>Unable to load this page</h2>
    <p>Check your connection and try again.</p><AppButton onClick={retry}>Try again</AppButton></PublicStateSection>;
}
