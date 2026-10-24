import { Router } from 'express';
import { getAdminMe } from '../controllers/admin.js';
import { createRequireFirebaseAuth, requireAdmin } from '../middleware/auth.js';

export function createAdminRouter(verifyIdToken) {
  const router = Router();
  router.get('/me', createRequireFirebaseAuth(verifyIdToken), requireAdmin, getAdminMe);
  return router;
}

export default createAdminRouter();
