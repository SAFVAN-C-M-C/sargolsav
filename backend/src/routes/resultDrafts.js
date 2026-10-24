import { Router } from 'express';
import { createRequireFirebaseAuth, requireAdmin } from '../middleware/auth.js';
import { createResultDraftService } from '../services/resultDrafts.js';
import { createResultDraftControllers } from '../controllers/resultDrafts.js';

export function createResultDraftRouter(verifyIdToken, service = createResultDraftService()) {
  const router = Router({ mergeParams: true });
  const auth = [createRequireFirebaseAuth(verifyIdToken), requireAdmin];
  const controllers = createResultDraftControllers(service);
  const draft = '/categories/:categoryId/events/:eventId/result-draft';
  router.post(draft, ...auth, controllers.initialize);
  router.get(draft, ...auth, controllers.get);
  router.put(draft, ...auth, controllers.save);
  router.put(`${draft}/shared-positions`, ...auth, controllers.saveShared);
  router.get('/result-statuses', ...auth, controllers.list);
  router.get('/categories/:categoryId/result-statuses', ...auth, controllers.list);
  return router;
}
export default createResultDraftRouter();
