import { Router } from 'express';
import {
  createSession,
  getAdaptiveState,
  getSessionById,
  getSessions,
  setManualDifficulty,
} from '../controllers/trainingController.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = Router();

router.use(requireAuth);
router.post('/sessions', createSession);
router.get('/sessions', getSessions);
router.get('/sessions/:id', getSessionById);
router.get('/adaptive', getAdaptiveState);
router.put('/adaptive/level', setManualDifficulty);

export default router;
