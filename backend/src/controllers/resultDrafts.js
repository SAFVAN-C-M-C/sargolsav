import { ResultDraftError } from '../services/resultDrafts.js';
import { CandidateError } from '../services/candidates.js';

export function createResultDraftControllers(service) {
  const handle = (operation) => async (request, response, next) => {
    try { await operation(request, response); }
    catch (error) {
      if (error instanceof ResultDraftError || error instanceof CandidateError) response.status(error.status).json({ error: error.message });
      else if (['23503', '23505', '40001', '40P01'].includes(error?.code)) response.status(409).json({ error: 'Result or related records changed; retrieve and retry' });
      else next(error);
    }
  };
  return {
    initialize: handle(async (r, res) => {
      const { draft, created } = await service.initialize(r.params, r.body, r.auth.uid);
      res.status(created ? 201 : 200).json({ draft });
    }),
    get: handle(async (r, res) => res.json({ draft: await service.get(r.params) })),
    save: handle(async (r, res) => res.json({ draft: await service.save(r.params, r.body, r.auth.uid) })),
    list: handle(async (r, res) => res.json({ results: await service.list(r.params, r.query) })),
  };
}
