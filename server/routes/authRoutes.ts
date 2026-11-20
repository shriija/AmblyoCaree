import { Router } from 'express';
import {
  forgotPassword,
  getCurrentUser,
  login,
  logout,
  register,
  resetPassword,
} from '../controllers/authController.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', requireAuth, getCurrentUser);

export default router;
