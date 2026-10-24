import { Router } from 'express';
import { getHealth } from '../controllers/health.js';

import { getDatabaseHealth } from '../controllers/databaseHealth.js';

const router = Router();
router.get('/db', getDatabaseHealth);
router.get('/', getHealth);
export default router;
