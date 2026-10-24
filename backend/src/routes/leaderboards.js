import { Router } from 'express';
import { createScoringService } from '../services/scoring.js';
import { resultHandler } from '../controllers/resultLifecycle.js';

export function createLeaderboardRouter(service = createScoringService()) {
  const router = Router({ mergeParams: true });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/categories/:categoryId/leaderboard/units', resultHandler(async (req, res) => {
    res.json({ leaderboard: await service.categoryUnits(req.params, req.query) });
  }));
  return router;
}

export default createLeaderboardRouter();
