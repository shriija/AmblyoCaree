import { Router } from 'express';
import {
  getLatestCalibration,
  resetCalibration,
  saveCalibration,
  updateCalibrationMode,
} from '../controllers/calibrationController.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = Router();

router.use(requireAuth);
router.post('/', saveCalibration);
router.put('/mode', updateCalibrationMode);
router.get('/latest', getLatestCalibration);
router.delete('/reset', resetCalibration);

export default router;
