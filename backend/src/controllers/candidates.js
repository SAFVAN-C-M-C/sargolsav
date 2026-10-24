import { CandidateError } from '../services/candidates.js';

export function createCandidateControllers(service) {
  const handle = (operation, status = 200) => async (request, response, next) => {
    try { response.status(status).json(await operation(request)); }
    catch (error) {
      if (error instanceof CandidateError) response.status(error.status).json({ error: error.message });
      else if (['23505', '23503'].includes(error?.code)) response.status(409).json({ error: 'Candidate conflicts with existing or related records' });
      else next(error);
    }
  };
  return {
    create: handle(async (r) => ({ candidate: await service.create(r.params, r.body, r.auth.uid) }), 201),
    list: handle(async (r) => ({ candidates: await service.list(r.params, r.query) })),
    lookup: handle(async (r) => ({ candidate: await service.lookup(r.params, r.query) })),
    get: handle(async (r) => ({ candidate: await service.get(r.params) })),
    update: handle(async (r) => ({ candidate: await service.update(r.params, r.body, r.auth.uid) })),
  };
}
