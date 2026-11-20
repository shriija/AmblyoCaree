import { Router } from 'express';
import { getProfile, updatePreferences, updateProfile } from '../controllers/userController.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = Router();

router.use(requireAuth);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/preferences', updatePreferences);

export default router;
