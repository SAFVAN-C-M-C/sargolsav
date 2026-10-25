import { SectionHeadingDiv } from '../../styles/components';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import type { AdminWorkspace } from '../../types/adminWorkspace';
import { ResultsWorkspace } from '../../components/admin/results/ResultsWorkspace';

export function AdminResults() {
  const { competition } = useOutletContext<AdminWorkspace>(); const [params] = useSearchParams();
  return <section aria-labelledby="results-title"><SectionHeadingDiv><h2 id="results-title">Results</h2><Link to={{ pathname: '/admin', search: `?${params}` }}>Back to dashboard</Link></SectionHeadingDiv>
    {competition ? <><p>Selected competition: <strong>{competition.name}</strong></p><ResultsWorkspace key={competition.id} competitionId={competition.id} /></> : <p>Select a competition above to manage result drafts.</p>}
  </section>;
}
