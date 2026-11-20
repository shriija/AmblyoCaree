/**
 * Centralized gaze tracking, fixation-gated calibration, validation, and bounds thresholds.
 * Standard webcam landmark tracking is an educational visual-training aid and is not clinical-grade eye tracking.
 */

export const GAZE_CONFIG = {
  // Calibration fixation-gated collection (adaptive noise-floor rolling window)
  CALIBRATION_SACCADE_SETTLE_MS: 400,
  CALIBRATION_NOISE_FLOOR_FRAMES: 20, // First ~20 valid frames on point 1 establish user noise floor
  CALIBRATION_NOISE_MULTIPLIER: 2.5, // Accept when rolling std <= max(noiseFloor * 2.5, minAbsStd)
  CALIBRATION_MIN_ABS_STD_X: 0.035, // Absolute minimum allowed iris X std floor
  CALIBRATION_MIN_ABS_STD_Y: 0.045, // Absolute minimum allowed iris Y std floor
  CALIBRATION_MIN_STABLE_FRAMES: 15,
  CALIBRATION_ROLLING_WINDOW_SIZE: 20,
  CALIBRATION_MAX_IRIS_STD_X: 0.07, // Fallback/reference upper std bound
  CALIBRATION_MAX_IRIS_STD_Y: 0.09,
  CALIBRATION_OUTLIER_SD_MULTIPLIER: 2.0,
  CALIBRATION_POINT_TIMEOUT_MS: 8000, // 8 s timeout: accept best frames if >= 10 valid, else Retry Point
  CALIBRATION_TIMEOUT_MIN_FRAMES: 10,
  CALIBRATION_FACE_LOST_FRAMES: 6,
  CALIBRATION_LOW_CONFIDENCE_AFTER_FAILS: 2, // Offer "Continue anyway (low accuracy)" after 2 failed attempts

  // Face framing, frontal head pose (~50% wider than 18°), eye-open validity, and lighting gates
  MAX_HEAD_YAW_DEG: 27,
  MAX_HEAD_PITCH_DEG: 27,
  FACE_FRAME_MARGIN_MIN: 0.03,
  FACE_FRAME_MARGIN_MAX: 0.97,
  MIN_EYE_OPEN_RATIO: 0.13,
  MIN_EYE_WIDTH_NORM: 0.007,
  MIN_BRIGHTNESS_OK: 30,
  MAX_BRIGHTNESS_OK: 230,

  // Calibration spread check (low 25% fraction of typical per-eye excursion, per axis) & ridge regression
  TYPICAL_EYE_RANGE_X: {
    left: 0.08,
    right: 0.08,
    both: 0.08,
  },
  TYPICAL_EYE_RANGE_Y: {
    left: 0.06,
    right: 0.06,
    both: 0.06,
  },
  MIN_CALIBRATION_SPREAD_FRACTION: 0.25,
  MIN_CALIBRATION_SPREAD_X: 0.02,
  MIN_CALIBRATION_SPREAD_Y: 0.015,
  RIDGE_REGULARIZATION_LAMBDA: 0.002,

  // 5-point post-fit validation step (pass if < 10% screen width; otherwise warn, never block)
  VALIDATION_SETTLE_MS: 400,
  VALIDATION_SAMPLES_PER_POINT: 15,
  VALIDATION_POINT_TIMEOUT_MS: 8000,
  VALIDATION_TIMEOUT_MIN_FRAMES: 5,
  VALIDATION_MAX_MEAN_ERROR_PCT: 10,

  // Out-of-bounds & extrapolation detection during live tracking / games
  FEATURE_RANGE_MARGIN_RATIO: 0.22,
  CONTAINER_TOLERANCE_MARGIN_PX: 36,
  GAME_OFFSCREEN_PAUSE_MS: 1500,
  GAME_RESUME_STABLE_MS: 500,

  // Exponential smoothing factor for visual reticle & stable tracking
  GAZE_SMOOTHING_ALPHA: 0.28,
} as const;

export const CALIBRATION_TARGETS = [
  { id: 1, label: 'Top Left', xNorm: 0.1, yNorm: 0.12 },
  { id: 2, label: 'Top Center', xNorm: 0.5, yNorm: 0.12 },
  { id: 3, label: 'Top Right', xNorm: 0.9, yNorm: 0.12 },
  { id: 4, label: 'Middle Left', xNorm: 0.1, yNorm: 0.5 },
  { id: 5, label: 'Center', xNorm: 0.5, yNorm: 0.5 },
  { id: 6, label: 'Middle Right', xNorm: 0.9, yNorm: 0.5 },
  { id: 7, label: 'Bottom Left', xNorm: 0.1, yNorm: 0.88 },
  { id: 8, label: 'Bottom Center', xNorm: 0.5, yNorm: 0.88 },
  { id: 9, label: 'Bottom Right', xNorm: 0.9, yNorm: 0.88 },
] as const;

// 5 new validation points placed at positions NOT used in the 9-point calibration grid
export const VALIDATION_TARGETS = [
  { id: 1, label: 'Upper Inner Left', xNorm: 0.28, yNorm: 0.28 },
  { id: 2, label: 'Upper Inner Right', xNorm: 0.72, yNorm: 0.28 },
  { id: 3, label: 'Upper Mid Center', xNorm: 0.5, yNorm: 0.34 },
  { id: 4, label: 'Lower Inner Left', xNorm: 0.28, yNorm: 0.72 },
  { id: 5, label: 'Lower Inner Right', xNorm: 0.72, yNorm: 0.72 },
] as const;
