import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { Request, Response } from 'express';
import { repository, type UserRecord } from '../services/repository.ts';
import { clearAuthCookie, setAuthCookie, signAuthToken } from '../utils/jwt.ts';
import { AppError, asyncHandler, validateEmail } from '../middleware/errorHandler.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';

function sanitizeUser(user: UserRecord) {
  const { password: _p, resetToken: _rt, resetTokenExpiry: _rte, ...safe } = user;
  return safe;
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password } = req.body as {
    name?: string;
    email?: string;
    password?: string;
  };

  if (!name || name.trim().length < 2) {
    throw new AppError('Please enter your full name (at least 2 characters).', 400);
  }
  if (!email || !validateEmail(email)) {
    throw new AppError('Please provide a valid email address.', 400);
  }
  if (!password || password.length < 8) {
    throw new AppError('Password must be at least 8 characters long.', 400);
  }

  const existing = await repository.findUserByEmail(email);
  if (existing) {
    throw new AppError('An account with this email already exists. Please sign in instead.', 409);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await repository.createUser({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: hashedPassword,
  });

  await repository.getOrCreateUserProgress(user._id);

  const token = signAuthToken({ userId: user._id, email: user.email });
  setAuthCookie(req, res, token);

  res.status(201).json({
    message: 'Account created successfully.',
    user: sanitizeUser(user),
    token,
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !validateEmail(email)) {
    throw new AppError('Please enter a valid email address.', 400);
  }
  if (!password) {
    throw new AppError('Please enter your password.', 400);
  }

  const user = await repository.findUserByEmail(email);
  if (!user) {
    throw new AppError('Invalid email or password.', 401);
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    throw new AppError('Invalid email or password.', 401);
  }

  const token = signAuthToken({ userId: user._id, email: user.email });
  setAuthCookie(req, res, token);

  res.status(200).json({
    message: 'Signed in successfully.',
    user: sanitizeUser(user),
    token,
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  clearAuthCookie(req, res);
  res.status(200).json({ message: 'Signed out successfully.' });
});

export const getCurrentUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('Not authenticated.', 401);
  }
  res.status(200).json({ user: req.user });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!email || !validateEmail(email)) {
    throw new AppError('Please enter a valid email address.', 400);
  }

  const user = await repository.findUserByEmail(email);
  if (!user) {
    // Generic message to prevent email enumeration
    res.status(200).json({
      message:
        'If an account exists for that email, a password reset code has been generated.',
      resetAvailable: false,
    });
    return;
  }

  const resetCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await repository.updateUser(user._id, {
    resetToken: resetCode,
    resetTokenExpiry: expiry,
  });

  res.status(200).json({
    message:
      'Password reset code generated (valid for 15 minutes). In local mode without SMTP email configured, use the reset code below to set a new password.',
    resetAvailable: true,
    devResetCode: resetCode,
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, resetCode, newPassword } = req.body as {
    email?: string;
    resetCode?: string;
    newPassword?: string;
  };

  if (!email || !validateEmail(email)) {
    throw new AppError('Please enter a valid email address.', 400);
  }
  if (!resetCode || resetCode.trim().length < 4) {
    throw new AppError('Please enter the password reset code.', 400);
  }
  if (!newPassword || newPassword.length < 8) {
    throw new AppError('New password must be at least 8 characters long.', 400);
  }

  const user = await repository.findUserByEmail(email);
  if (
    !user ||
    !user.resetToken ||
    user.resetToken !== resetCode.trim().toUpperCase() ||
    !user.resetTokenExpiry ||
    new Date(user.resetTokenExpiry).getTime() < Date.now()
  ) {
    throw new AppError('Invalid or expired reset code.', 400);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await repository.updateUser(user._id, {
    password: hashedPassword,
    resetToken: null,
    resetTokenExpiry: null,
  });

  res.status(200).json({
    message: 'Your password has been updated. You can now sign in with your new password.',
  });
});
