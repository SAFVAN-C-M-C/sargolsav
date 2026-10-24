import { Router } from 'express';
import { createRequireFirebaseAuth, requireAdmin } from '../middleware/auth.js';
import { createCompetitionControllers } from '../controllers/competitions.js';

export function createCompetitionRouter(verifyIdToken, service) {
  const router = Router();
  const controller = createCompetitionControllers(service);
  router.use(createRequireFirebaseAuth(verifyIdToken), requireAdmin);
  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.update);
  router.patch('/:id/status', controller.updateStatus);
  router.get('/:id/settings', controller.getSettings);
  router.put('/:id/settings', controller.updateSettings);
  return router;
}

export default createCompetitionRouter();
