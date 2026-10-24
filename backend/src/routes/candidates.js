import { Router } from 'express';
import { createRequireFirebaseAuth, requireAdmin } from '../middleware/auth.js';
import { createCandidateService } from '../services/candidates.js';
import { createCandidateControllers } from '../controllers/candidates.js';

export function createCandidateRouter(verifyIdToken, service = createCandidateService()) {
  const router = Router({ mergeParams: true });
  router.use(createRequireFirebaseAuth(verifyIdToken), requireAdmin);
  const controllers = createCandidateControllers(service);
  router.post('/', controllers.create);
  router.get('/', controllers.list);
  router.get('/lookup', controllers.lookup);
  router.get('/:candidateId', controllers.get);
  router.patch('/:candidateId', controllers.update);
  return router;
}
export default createCandidateRouter();
