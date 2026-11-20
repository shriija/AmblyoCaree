import type { Response } from 'express';
import { repository } from '../services/repository.ts';
import { AppError, asyncHandler } from '../middleware/errorHandler.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import type {
  AffectedEye,
  CalibrationModeKey,
  ICalibrationPoint,
  IReferenceValues,
  IValidationError,
  PracticeMode,
} from '../models/Calibration.ts';

const VALID_AFFECTED_EYES: AffectedEye[] = ['left', 'right', 'not-sure'];
const VALID_PRACTICE_MODES: PracticeMode[] = ['affected-eye-only', 'both-eyes'];

function resolveTrackingMode(
  affectedEye: AffectedEye,
  practiceMode: PracticeMode
): CalibrationModeKey {
  if (practiceMode === 'affected-eye-only') {
    if (affectedEye === 'left') return 'left';
    if (affectedEye === 'right') return 'right';
    throw new AppError(
      'Please select Left or Right as the affected eye to use Affected Eye Only mode.',
      400
    );
  }
  return 'both';
}

export const saveCalibration = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const {
    affectedEye = 'not-sure',
    practiceMode = 'both-eyes',
    calibrationPoints,
    referenceValues,
    validationError = null,
    lowConfidence = false,
    calibrationStatus,
  } = req.body as {
    affectedEye?: AffectedEye;
    practiceMode?: PracticeMode;
    calibrationPoints?: ICalibrationPoint[];
    referenceValues?: IReferenceValues;
    validationError?: IValidationError | null;
    lowConfidence?: boolean;
    calibrationStatus?: 'completed' | 'incomplete' | 'failed';
  };

  if (!VALID_AFFECTED_EYES.includes(affectedEye)) {
    throw new AppError('Invalid affected eye selection.', 400);
  }
  if (!VALID_PRACTICE_MODES.includes(practiceMode)) {
    throw new AppError('Invalid practice mode selection.', 400);
  }

  const activeTrackingMode = resolveTrackingMode(affectedEye, practiceMode);
  const safePoints = Array.isArray(calibrationPoints) ? calibrationPoints : [];

  if (!lowConfidence && safePoints.length < 4) {
    throw new AppError(
      'At least 4 recorded calibration points are required to compute a valid gaze mapping.',
      400
    );
  }

  if (
    !referenceValues ||
    typeof referenceValues.xMin !== 'number' ||
    typeof referenceValues.xMax !== 'number' ||
    typeof referenceValues.yMin !== 'number' ||
    typeof referenceValues.yMax !== 'number'
  ) {
    throw new AppError('Calibration reference values (Xmin, Xmax, Ymin, Ymax) are required.', 400);
  }

  if (
    !lowConfidence &&
    (referenceValues.xMax <= referenceValues.xMin || referenceValues.yMax <= referenceValues.yMin)
  ) {
    throw new AppError(
      'Eye landmark range is too narrow. Please ensure your face is well-lit and look clearly at each target.',
      400
    );
  }

  if (
    !lowConfidence &&
    validationError &&
    validationError.passed === false &&
    calibrationStatus !== 'failed'
  ) {
    throw new AppError(
      `Validation error (${validationError.meanErrorPct.toFixed(1)}%) exceeded the ${validationError.thresholdPct}% threshold. Please recalibrate or continue with low accuracy.`,
      400
    );
  }

  // When saving a low-confidence fallback calibration, ensure non-degenerate min/max bounds
  const safeReferenceValues: IReferenceValues = { ...referenceValues };
  if (lowConfidence) {
    if (safeReferenceValues.xMax <= safeReferenceValues.xMin) {
      const cx = Number.isFinite(safeReferenceValues.centerX) ? safeReferenceValues.centerX : 0.5;
      safeReferenceValues.xMin = Number((cx - 0.05).toFixed(5));
      safeReferenceValues.xMax = Number((cx + 0.05).toFixed(5));
    }
    if (safeReferenceValues.yMax <= safeReferenceValues.yMin) {
      const cy = Number.isFinite(safeReferenceValues.centerY) ? safeReferenceValues.centerY : 0.5;
      safeReferenceValues.yMin = Number((cy - 0.04).toFixed(5));
      safeReferenceValues.yMax = Number((cy + 0.04).toFixed(5));
    }
  }

  const record = await repository.saveCalibration({
    userId,
    affectedEye,
    practiceMode,
    activeTrackingMode,
    calibrationPoints: safePoints,
    referenceValues: safeReferenceValues,
    validationError,
    lowConfidence: Boolean(lowConfidence),
    calibrationStatus: calibrationStatus || 'completed',
  });

  // Keep user's default targetEye preference aligned with the active calibrated mode
  const user = await repository.findUserById(userId);
  if (user) {
    await repository.updateUser(userId, {
      preferences: {
        ...user.preferences,
        targetEye: activeTrackingMode,
      },
    });
  }

  res.status(201).json({
    message: 'Calibration saved successfully.',
    calibration: record,
  });
});

export const updateCalibrationMode = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const { affectedEye, practiceMode } = req.body as {
      affectedEye?: AffectedEye;
      practiceMode?: PracticeMode;
    };

    if (!affectedEye || !VALID_AFFECTED_EYES.includes(affectedEye)) {
      throw new AppError('Please choose Left, Right, or Not sure for the affected eye.', 400);
    }
    if (!practiceMode || !VALID_PRACTICE_MODES.includes(practiceMode)) {
      throw new AppError('Please choose Affected eye only or Both eyes.', 400);
    }

    const activeTrackingMode = resolveTrackingMode(affectedEye, practiceMode);

    const record = await repository.updateCalibrationMode({
      userId,
      affectedEye,
      practiceMode,
      activeTrackingMode,
    });

    const user = await repository.findUserById(userId);
    if (user) {
      await repository.updateUser(userId, {
        preferences: {
          ...user.preferences,
          targetEye: activeTrackingMode,
        },
      });
    }

    res.status(200).json({
      message:
        record.calibrationStatus === 'completed'
          ? 'Practice mode switched and existing calibration mapping loaded.'
          : 'Practice mode saved. Please complete 9-point calibration for this mode.',
      calibration: record,
      requiresCalibration: record.calibrationStatus !== 'completed',
    });
  }
);

export const getLatestCalibration = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const calibration = await repository.getLatestCalibration(userId);
    res.status(200).json({ calibration });
  }
);

export const resetCalibration = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  await repository.deleteUserCalibrations(userId);
  res.status(200).json({ message: 'Calibration data has been reset.' });
});
