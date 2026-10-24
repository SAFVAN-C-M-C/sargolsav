import { Router } from 'express';
import { createRequireFirebaseAuth, requireAdmin } from '../middleware/auth.js';
import { createResultLifecycleService, createPublicResultService } from '../services/resultLifecycle.js';
import { createResultLifecycleControllers, createPublicResultControllers } from '../controllers/resultLifecycle.js';

export function createResultLifecycleRouter(verifyIdToken, service = createResultLifecycleService()) {
  const router = Router({ mergeParams: true });
  const auth = [createRequireFirebaseAuth(verifyIdToken), requireAdmin];
  const c = createResultLifecycleControllers(service);
  const root = '/categories/:categoryId/events/:eventId/result';
  router.get(root, ...auth, c.get);
  router.post(`${root}/review`, ...auth, c.review);
  router.post(`${root}/return-to-draft`, ...auth, c.returnToDraft);
  router.post(`${root}/publish`, ...auth, c.publish);
  router.post(`${root}/corrections`, ...auth, c.startCorrection);
  const correction = `${root}/corrections/:correctionId`;
  router.get(correction, ...auth, c.getCorrection);
  router.put(correction, ...auth, c.saveCorrection);
  router.put(`${correction}/shared-positions`, ...auth, c.saveSharedCorrection);
  router.post(`${correction}/review`, ...auth, c.reviewCorrection);
  router.post(`${correction}/return-to-draft`, ...auth, c.returnCorrection);
  router.post(`${correction}/publish`, ...auth, c.publishCorrection);
  return router;
}
export function createPublicResultRouter(service = createPublicResultService()) {
  const router = Router({ mergeParams: true });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const c = createPublicResultControllers(service);
  router.get('/results', c.list);
  router.get('/categories/:categoryId/results', c.list);
  const root = '/categories/:categoryId/events/:eventId/result';
  router.get(root, c.get);
  router.get(`${root}/status`, c.status);
  return router;
}
export default createResultLifecycleRouter();
export const publicResultRouter = createPublicResultRouter();
