import { Router } from 'express';
import { getAnalytics } from '../controllers/trainingController.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = Router();

router.use(requireAuth);
router.get('/overview', getAnalytics);

export default router;
