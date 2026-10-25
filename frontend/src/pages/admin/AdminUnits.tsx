import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { CompetitionUnits } from '../../components/admin/participants/CompetitionUnits';
import type { AdminWorkspace } from '../../types/adminWorkspace';

export function AdminUnits() {
  const { competition } = useOutletContext<AdminWorkspace>();
  const [params] = useSearchParams();
  return <section aria-labelledby="units-title">
    <div className="section-heading"><h2 id="units-title">Units &amp; Madrassas</h2><Link to={{ pathname: '/admin', search: `?${params.toString()}` }}>Back to dashboard</Link></div>
    {competition ? <><p className="admin-context">Selected competition: <strong>{competition.name}</strong></p>
      <p>Units may have zero or more Madrassas. Records referenced by candidates or results cannot be deleted through normal management APIs. A unit with Madrassas also cannot be deleted. Related records are never removed automatically.</p>
      <CompetitionUnits key={competition.id} competitionId={competition.id} competitionName={competition.name} />
    </> : <p>Select a competition above to manage its units and optional Madrassas.</p>}
  </section>;
}
