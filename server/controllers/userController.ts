import type { Response } from 'express';
import { repository } from '../services/repository.ts';
import { AppError, asyncHandler, validateEmail } from '../middleware/errorHandler.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import type { DifficultyLevel, EyeMode } from '../models/User.ts';
import { getPresetForLevel } from '../utils/adaptiveEngine.ts';

export const getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const user = await repository.findUserById(userId);
  if (!user) throw new AppError('User not found.', 404);

  const calibration = await repository.getLatestCalibration(userId);
  const progress = await repository.getOrCreateUserProgress(userId);

  const { password: _p, resetToken: _rt, resetTokenExpiry: _rte, ...safeUser } = user;
  res.status(200).json({
    user: safeUser,
    calibration,
    progress,
  });
});

export const updateProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { name, email, profileImage } = req.body as {
    name?: string;
    email?: string;
    profileImage?: string;
  };

  const updates: Record<string, unknown> = {};

  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      throw new AppError('Name must be between 2 and 80 characters.', 400);
    }
    updates.name = trimmed;
  }

  if (typeof email === 'string') {
    const normalized = email.trim().toLowerCase();
    if (!validateEmail(normalized)) {
      throw new AppError('Please provide a valid email address.', 400);
    }
    const existing = await repository.findUserByEmail(normalized);
    if (existing && existing._id !== userId) {
      throw new AppError('That email address is already in use by another account.', 409);
    }
    updates.email = normalized;
  }

  if (typeof profileImage === 'string') {
    if (profileImage.length > 500_000) {
      throw new AppError('Profile image data is too large (max ~350KB).', 400);
    }
    updates.profileImage = profileImage;
  }

  const updated = await repository.updateUser(userId, updates);
  if (!updated) throw new AppError('User not found.', 404);

  const { password: _p, resetToken: _rt, resetTokenExpiry: _rte, ...safeUser } = updated;
  res.status(200).json({
    message: 'Profile updated successfully.',
    user: safeUser,
  });
});

export const updatePreferences = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const current = await repository.findUserById(userId);
  if (!current) throw new AppError('User not found.', 404);

  const body = req.body as Partial<{
    preferredCameraId: string;
    targetEye: EyeMode;
    adaptiveEnabled: boolean;
    preferredDifficulty: DifficultyLevel;
    showGazeIndicator: boolean;
    sessionDurationSec: number;
  }>;

  const validEyes: EyeMode[] = ['both', 'left', 'right'];
  const validLevels: DifficultyLevel[] = ['beginner', 'intermediate', 'advanced'];

  const nextPreferences = {
    ...current.preferences,
    ...(typeof body.preferredCameraId === 'string'
      ? { preferredCameraId: body.preferredCameraId }
      : {}),
    ...(body.targetEye && validEyes.includes(body.targetEye)
      ? { targetEye: body.targetEye }
      : {}),
    ...(typeof body.adaptiveEnabled === 'boolean'
      ? { adaptiveEnabled: body.adaptiveEnabled }
      : {}),
    ...(body.preferredDifficulty && validLevels.includes(body.preferredDifficulty)
      ? { preferredDifficulty: body.preferredDifficulty }
      : {}),
    ...(typeof body.showGazeIndicator === 'boolean'
      ? { showGazeIndicator: body.showGazeIndicator }
      : {}),
    ...(typeof body.sessionDurationSec === 'number' &&
    body.sessionDurationSec >= 15 &&
    body.sessionDurationSec <= 180
      ? { sessionDurationSec: Math.round(body.sessionDurationSec) }
      : {}),
  };

  const updated = await repository.updateUser(userId, { preferences: nextPreferences });
  if (!updated) throw new AppError('User not found.', 404);

  // Sync baseline difficulty preset if user explicitly changed preferredDifficulty
  if (
    body.preferredDifficulty &&
    validLevels.includes(body.preferredDifficulty) &&
    body.preferredDifficulty !== current.preferences.preferredDifficulty
  ) {
    await repository.upsertUserProgress(userId, {
      currentDifficultyLevel: body.preferredDifficulty,
      adaptiveParams: getPresetForLevel(body.preferredDifficulty),
      lastAdjustmentNote: `Manually set starting difficulty to ${body.preferredDifficulty.charAt(0).toUpperCase() + body.preferredDifficulty.slice(1)}.`,
    });
  }

  const { password: _p, resetToken: _rt, resetTokenExpiry: _rte, ...safeUser } = updated;
  const progress = await repository.getOrCreateUserProgress(userId);

  res.status(200).json({
    message: 'Settings saved successfully.',
    user: safeUser,
    progress,
  });
});
