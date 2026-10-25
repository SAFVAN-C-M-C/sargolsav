import { AppButton, DashboardPanelDiv, LoadingSkeleton } from '../../styles/components';
export function DashboardLoading({ children }: { children: string }) {
  return <DashboardPanelDiv role="status"><p>{children}</p><LoadingSkeleton aria-hidden="true" /></DashboardPanelDiv>;
}

export function DashboardError({ retry, children }: { retry: () => void; children: string }) {
  return <DashboardPanelDiv role="alert"><h2>Could not load data</h2><p>{children}</p><AppButton type="button" onClick={retry}>Try again</AppButton></DashboardPanelDiv>;
}
