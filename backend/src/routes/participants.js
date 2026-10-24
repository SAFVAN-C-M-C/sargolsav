import { Router } from 'express';
import { createRequireFirebaseAuth, requireAdmin } from '../middleware/auth.js';
import { createParticipantService } from '../services/participants.js';
import { createParticipantControllers } from '../controllers/participants.js';

export function createParticipantRouter(verifyIdToken, service = createParticipantService()) {
  const router = Router({ mergeParams: true });
  router.use(createRequireFirebaseAuth(verifyIdToken), requireAdmin);
  const units = createParticipantControllers(service.units, 'unit', 'Unit');
  const madrasas = createParticipantControllers(service.madrasas, 'madrasa', 'Madrassa');
  router.post('/', units.create);
  router.get('/', units.list);
  router.get('/:unitId', units.get);
  router.patch('/:unitId', units.update);
  router.delete('/:unitId', units.remove);
  router.post('/:unitId/madrasas', madrasas.create);
  router.get('/:unitId/madrasas', madrasas.list);
  router.get('/:unitId/madrasas/:madrasaId', madrasas.get);
  router.patch('/:unitId/madrasas/:madrasaId', madrasas.update);
  router.delete('/:unitId/madrasas/:madrasaId', madrasas.remove);
  return router;
}

export default createParticipantRouter();
