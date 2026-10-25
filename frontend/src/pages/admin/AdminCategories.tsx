import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { CompetitionCategories } from '../../components/admin/catalog/CompetitionCategories';
import type { AdminWorkspace } from '../../types/adminWorkspace';

export function AdminCategories() {
  const { competition } = useOutletContext<AdminWorkspace>();
  const [params] = useSearchParams();
  return <section aria-labelledby="categories-title">
    <div className="section-heading"><h2 id="categories-title">Categories &amp; Events</h2><Link to={{ pathname: '/admin', search: `?${params.toString()}` }}>Back to dashboard</Link></div>
    {competition ? <><p className="admin-context">Selected competition: <strong>{competition.name}</strong></p>
      <p>Categories and events appear in configured display order. Categories with events or candidates cannot be deleted. Any result set, including an empty draft, or dependent audit records protects an event from deletion. Related records are never removed automatically.</p>
      <CompetitionCategories key={competition.id} competitionId={competition.id} competitionName={competition.name} />
    </> : <p>Select a competition above to manage its categories and events.</p>}
  </section>;
}
