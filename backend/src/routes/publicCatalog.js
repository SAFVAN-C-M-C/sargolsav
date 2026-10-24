import { Router } from 'express';
import { createPublicCatalogService } from '../services/publicCatalog.js';
import { CompetitionError } from '../services/competitions.js';

export function createPublicCatalogRouter(service = createPublicCatalogService()) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const handle = (operation) => async (req, res, next) => {
    try { res.json(await operation(req)); }
    catch (error) {
      if (error instanceof CompetitionError) res.status(error.status).json({ error: error.message });
      else next(error);
    }
  };
  router.get('/', handle(async () => ({ competitions: await service.list() })));
  router.get('/:competitionId/categories', handle((req) => service.categories(req.params.competitionId)));
  return router;
}

export default createPublicCatalogRouter();
