import { Router } from 'express';
import { createRequireFirebaseAuth, requireAdmin } from '../middleware/auth.js';
import { createCatalogService } from '../services/catalog.js';
import { createCatalogControllers } from '../controllers/catalog.js';

export function createCatalogRouter(verifyIdToken, service = createCatalogService()) {
  const router = Router({ mergeParams: true });
  router.use(createRequireFirebaseAuth(verifyIdToken), requireAdmin);
  const categories = createCatalogControllers(service.categories, 'category', 'Category');
  const events = createCatalogControllers(service.events, 'event', 'Event');
  router.post('/', categories.create);
  router.get('/', categories.list);
  router.get('/:categoryId', categories.get);
  router.patch('/:categoryId', categories.update);
  router.delete('/:categoryId', categories.remove);
  router.post('/:categoryId/events', events.create);
  router.get('/:categoryId/events', events.list);
  router.get('/:categoryId/events/:eventId', events.get);
  router.patch('/:categoryId/events/:eventId', events.update);
  router.delete('/:categoryId/events/:eventId', events.remove);
  return router;
}

export default createCatalogRouter();
