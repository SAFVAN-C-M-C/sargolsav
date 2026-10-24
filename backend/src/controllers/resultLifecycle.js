import { ResultDraftError } from '../services/resultDrafts.js';
import { CandidateError } from '../services/candidates.js';

export function resultHandler(operation) {
  return async (request, response, next) => {
    try { await operation(request, response); }
    catch (error) {
      if (error instanceof ResultDraftError || error instanceof CandidateError) response.status(error.status).json({ error: error.message });
      else if (['23503','23505','40001','40P01'].includes(error?.code)) response.status(409).json({ error: 'Result or related records changed; retrieve and retry' });
      else next(error);
    }
  };
}
export function createResultLifecycleControllers(service) {
  const item = (operation, correction = false, status = 200) => resultHandler(async (r, res) => {
    const value = operation === 'get' ? await service.get(r.params, correction)
      : operation === 'startCorrection' || operation === 'saveCorrection' ? await service[operation](r.params, r.body, r.auth.uid)
        : await service[operation](r.params, r.body, r.auth.uid, correction);
    res.status(status).json({ [correction ? 'correction' : 'result']: value });
  });
  return {
    get: item('get'), review: item('review'), returnToDraft: item('returnToDraft'), publish: item('publish'),
    startCorrection: item('startCorrection', true, 201), getCorrection: item('get', true), saveCorrection: item('saveCorrection', true),
    reviewCorrection: item('review', true), returnCorrection: item('returnToDraft', true), publishCorrection: item('publish', true),
  };
}
export function createPublicResultControllers(service) {
  const item = (method, key) => resultHandler(async (r, res) => res.json({ [key]: await service[method](r.params, r.query) }));
  return { list: item('list', 'results'), get: item('get', 'result'), status: item('status', 'availability') };
}
