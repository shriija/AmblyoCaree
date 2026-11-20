import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type {
  CalibrationPointData,
  EyeMode,
  GazeStatus,
  ReferenceValues,
  RegressionModel,
  ValidationError,
} from '../../types';
import { GAZE_CONFIG } from './gazeConfig';

export interface PerEyeMetrics {
  /** Iris horizontal offset relative to this eye's corners (0 = screen left, 1 = screen right). */
  offsetX: number;
  /** Iris vertical offset relative to this eye's eyelids (0 = screen top, 1 = screen bottom). */
  offsetY: number;
  /** Normalized eye corner-to-corner horizontal width. */
  eyeWidth: number;
  /** Eye opening ratio (eyelid height / eye width), compared against GAZE_CONFIG.MIN_EYE_OPEN_RATIO. */
  openRatio: number;
  /** True when openRatio < GAZE_CONFIG.MIN_EYE_OPEN_RATIO or landmarks are unavailable. */
  isBlinking: boolean;
  /** True when this eye's corners, eyelids, and iris landmarks are finite and eyeWidth > MIN_EYE_WIDTH_NORM. */
  valid: boolean;
  /** Raw unmirrored MediaPipe normalized iris center (0..1). */
  irisNormalized: { x: number; y: number };
}

export interface EyeLandmarkSample {
  rawX: number;
  rawY: number;
  leftIrisX: number;
  leftIrisY: number;
  rightIrisX: number;
  rightIrisY: number;
  leftIrisNormalized: { x: number; y: number };
  rightIrisNormalized: { x: number; y: number };
  leftEyeOpenRatio: number;
  rightEyeOpenRatio: number;
  /** Per-eye independent diagnostics (MediaPipe anatomical left/right). */
  leftEye: PerEyeMetrics;
  rightEye: PerEyeMetrics;
  /** Total landmarks returned by MediaPipe for this frame (478 when iris refinement is active). */
  landmarkCount: number;
  yawDeg: number;
  pitchDeg: number;
  headPoseOk: boolean;
  faceInFrame: boolean;
  isBlinking: boolean;
  valid: boolean;
}

export interface MappedGazePoint {
  // Unclamped predicted viewport coordinates in pixels (NEVER silently clamped)
  rawX: number;
  rawY: number;
  // Unclamped normalized viewport coordinates (can be < 0 or > 1 when looking off-screen)
  rawXNorm: number;
  rawYNorm: number;
  // Clamped display-only viewport coordinates (for rendering an edge indicator ONLY, never hit detection)
  clampedX: number;
  clampedY: number;
  // Backward-compatible aliases (unclamped viewport coords)
  xNorm: number;
  yNorm: number;
  xScreen: number;
  yScreen: number;
  // Active iris-relative feature coordinates used to compute gaze
  irisX: number;
  irisY: number;
  // Validity & bounds flags
  valid: boolean;
  inFeatureBounds: boolean;
  inScreenBounds: boolean;
  inBounds: boolean;
  headPoseOk: boolean;
  faceInFrame: boolean;
  lightingOk: boolean;
  isBlinking: boolean;
  gazeStatus: GazeStatus;
  confidence: number;
}

export interface ContainerRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ContainerGazePoint {
  // Unclamped container-local coordinates in pixels (used for hit detection)
  containerX: number;
  containerY: number;
  // Visually clamped coordinates strictly for rendering edge indicator
  clampedContainerX: number;
  clampedContainerY: number;
  containerXNorm: number;
  containerYNorm: number;
  valid: boolean;
  inContainerBounds: boolean;
  inBounds: boolean;
  gazeStatus: GazeStatus;
  confidence: number;
}

export interface RollingStabilityResult {
  count: number;
  stdX: number;
  stdY: number;
  isStable: boolean;
}

export interface CalibrationSpreadCheckResult {
  valid: boolean;
  spreadX: number;
  spreadY: number;
  reason?: string;
}

export interface ValidationPointInput {
  id: number;
  label: string;
  targetX: number;
  targetY: number;
  predictedX: number;
  predictedY: number;
}

/**
 * CANONICAL LEFT / RIGHT EYE DEFINITION (used consistently across landmark extraction,
 * mirrored preview overlay, validity gates, calibration mapping, and training games):
 *
 * We strictly follow MediaPipe FaceLandmarker's own anatomical left/right convention
 * (matching FaceLandmarker.FACE_LANDMARKS_LEFT_EYE / FACE_LANDMARKS_RIGHT_EYE and
 * FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS / FACE_LANDMARKS_RIGHT_IRIS):
 *
 * - "right" = subject's anatomical RIGHT eye:
 *   outer corner 33, inner corner 133, top lid 159, bottom lid 145, iris 468..472.
 *   In the raw unmirrored camera frame passed to MediaPipe, this sits on the LEFT half (x < 0.5).
 *   In our CSS-mirrored selfie preview (-scale-x-100), it renders on the RIGHT half over the user's right eye.
 *
 * - "left"  = subject's anatomical LEFT eye:
 *   inner corner 362, outer corner 263, top lid 386, bottom lid 374, iris 473..477.
 *   In the raw unmirrored camera frame passed to MediaPipe, this sits on the RIGHT half (x > 0.5).
 *   In our CSS-mirrored selfie preview (-scale-x-100), it renders on the LEFT half over the user's left eye.
 *
 * Sign convention (identical for BOTH eyes in raw unmirrored camera coordinates):
 * - Looking toward screen-RIGHT moves both irises toward smaller raw x (toward 33 on right eye, 362 on left eye).
 * - Looking toward screen-LEFT  moves both irises toward larger raw x (toward 133 on right eye, 263 on left eye).
 * - Therefore `offsetX = 1 - (iris.x - min(inner.x, outer.x)) / eyeWidth` increases (0 -> 1) from screen-left to screen-right for BOTH eyes.
 * - `offsetY = (iris.y - min(top.y, bottom.y)) / eyeHeight` increases (0 -> 1) from screen-top to screen-bottom for BOTH eyes.
 */
export const LANDMARK_INDICES = {
  // MediaPipe FACE_LANDMARKS_RIGHT_EYE / FACE_LANDMARKS_RIGHT_IRIS (subject's anatomical RIGHT eye)
  RIGHT_EYE_OUTER: 33,
  RIGHT_EYE_INNER: 133,
  RIGHT_EYE_TOP: 159,
  RIGHT_EYE_BOTTOM: 145,
  RIGHT_IRIS_CENTER: 468,
  RIGHT_IRIS_RING: [468, 469, 470, 471, 472],

  // MediaPipe FACE_LANDMARKS_LEFT_EYE / FACE_LANDMARKS_LEFT_IRIS (subject's anatomical LEFT eye)
  LEFT_EYE_INNER: 362,
  LEFT_EYE_OUTER: 263,
  LEFT_EYE_TOP: 386,
  LEFT_EYE_BOTTOM: 374,
  LEFT_IRIS_CENTER: 473,
  LEFT_IRIS_RING: [473, 474, 475, 476, 477],

  // Face pose & boundary landmarks (eye-independent)
  NOSE_TIP: 1,
  FOREHEAD_TOP: 10,
  CHIN_BOTTOM: 152,
  RIGHT_CHEEK: 234,
  LEFT_CHEEK: 454,
};

// Default uncalibrated bounds (empirical baseline before user completes 9-point calibration)
export const DEFAULT_REFERENCE_VALUES: ReferenceValues = {
  xMin: 0.34,
  xMax: 0.66,
  yMin: 0.34,
  yMax: 0.66,
  screenWidth: 1280,
  screenHeight: 720,
  centerX: 0.5,
  centerY: 0.5,
  calibrationQuality: 0,
};

const INVALID_EYE_METRICS: PerEyeMetrics = {
  offsetX: 0.5,
  offsetY: 0.5,
  eyeWidth: 0,
  openRatio: 0,
  isBlinking: true,
  valid: false,
  irisNormalized: { x: 0.5, y: 0.5 },
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function standardDeviation(values: number[], avg?: number): number {
  if (values.length < 2) return 0;
  const m = avg ?? mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) * (v - m), 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
}

function isValidLandmark(pt: NormalizedLandmark | undefined): pt is NormalizedLandmark {
  return Boolean(pt && Number.isFinite(pt.x) && Number.isFinite(pt.y));
}

function averageLandmarksChecked(
  landmarks: NormalizedLandmark[],
  indices: number[]
): { x: number; y: number; valid: boolean } {
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (const idx of indices) {
    const pt = landmarks[idx];
    if (isValidLandmark(pt)) {
      sx += pt.x;
      sy += pt.y;
      count += 1;
    }
  }
  if (count === 0) return { x: 0.5, y: 0.5, valid: false };
  return { x: sx / count, y: sy / count, valid: count === indices.length };
}

export function getSampleFeature(
  sample: Pick<EyeLandmarkSample, 'rawX' | 'rawY' | 'leftIrisX' | 'leftIrisY' | 'rightIrisX' | 'rightIrisY'>,
  eyeMode: EyeMode
): { x: number; y: number } {
  if (eyeMode === 'left') {
    return { x: sample.leftIrisX, y: sample.leftIrisY };
  }
  if (eyeMode === 'right') {
    return { x: sample.rightIrisX, y: sample.rightIrisY };
  }
  return { x: sample.rawX, y: sample.rawY };
}

interface SingleEyeSpec {
  innerCornerIdx: number;
  outerCornerIdx: number;
  topIdx: number;
  bottomIdx: number;
  irisRingIndices: number[];
}

function extractSingleEye(
  landmarks: NormalizedLandmark[],
  spec: SingleEyeSpec
): PerEyeMetrics {
  const inner = landmarks[spec.innerCornerIdx];
  const outer = landmarks[spec.outerCornerIdx];
  const top = landmarks[spec.topIdx];
  const bottom = landmarks[spec.bottomIdx];
  const iris = averageLandmarksChecked(landmarks, spec.irisRingIndices);

  if (
    !isValidLandmark(inner) ||
    !isValidLandmark(outer) ||
    !isValidLandmark(top) ||
    !isValidLandmark(bottom) ||
    !iris.valid
  ) {
    return { ...INVALID_EYE_METRICS, irisNormalized: { x: 0.5, y: 0.5 } };
  }

  const eyeWidth = Math.abs(outer.x - inner.x);
  const eyeHeight = Math.abs(bottom.y - top.y);
  const safeWidth = Math.max(0.004, eyeWidth);
  const safeHeight = Math.max(0.002, eyeHeight);

  const openRatio = safeHeight / safeWidth;
  const isBlinking = openRatio < GAZE_CONFIG.MIN_EYE_OPEN_RATIO;

  // minX is the image-left corner for either eye (RIGHT_EYE_OUTER=33 for right eye, LEFT_EYE_INNER=362 for left eye).
  // Inverting X produces the same sign convention for both eyes: 0 = screen left, 1 = screen right.
  const minX = Math.min(inner.x, outer.x);
  const minY = Math.min(top.y, bottom.y);

  // Do NOT tightly clamp to [0, 1] so extreme off-screen gaze stays detectable for extrapolation rejection.
  const offsetX = clamp(1 - (iris.x - minX) / safeWidth, -0.5, 1.5);
  const offsetY = clamp((iris.y - minY) / safeHeight, -0.5, 1.5);

  const valid =
    Number.isFinite(offsetX) &&
    Number.isFinite(offsetY) &&
    eyeWidth > GAZE_CONFIG.MIN_EYE_WIDTH_NORM;

  return {
    offsetX,
    offsetY,
    eyeWidth,
    openRatio,
    isBlinking,
    valid,
    irisNormalized: { x: iris.x, y: iris.y },
  };
}

const RIGHT_EYE_SPEC: SingleEyeSpec = {
  outerCornerIdx: LANDMARK_INDICES.RIGHT_EYE_OUTER,
  innerCornerIdx: LANDMARK_INDICES.RIGHT_EYE_INNER,
  topIdx: LANDMARK_INDICES.RIGHT_EYE_TOP,
  bottomIdx: LANDMARK_INDICES.RIGHT_EYE_BOTTOM,
  irisRingIndices: LANDMARK_INDICES.RIGHT_IRIS_RING,
};

const LEFT_EYE_SPEC: SingleEyeSpec = {
  innerCornerIdx: LANDMARK_INDICES.LEFT_EYE_INNER,
  outerCornerIdx: LANDMARK_INDICES.LEFT_EYE_OUTER,
  topIdx: LANDMARK_INDICES.LEFT_EYE_TOP,
  bottomIdx: LANDMARK_INDICES.LEFT_EYE_BOTTOM,
  irisRingIndices: LANDMARK_INDICES.LEFT_IRIS_RING,
};

/**
 * Extracts iris position strictly relative to each eye's own corners and eyelids, along with
 * approximate head yaw/pitch angles and face-in-frame check computed solely from
 * nose, forehead, chin, and face-outline landmarks (never from eye positions).
 *
 * - Single-eye mode ('left' or 'right'): active coordinates (rawX/rawY), validity, and blink state
 *   depend ONLY on the tracked eye; the other eye's metrics are populated strictly as read-only
 *   debug telemetry and never influence any gate or coordinate.
 * - Both-eyes mode ('both'): evaluates left and right eyes independently and averages both irises.
 */
export function extractEyeLandmarks(
  landmarks: NormalizedLandmark[],
  eyeMode: EyeMode = 'both'
): EyeLandmarkSample {
  const landmarkCount = landmarks ? landmarks.length : 0;
  if (!landmarks || landmarkCount === 0) {
    return {
      rawX: 0.5,
      rawY: 0.5,
      leftIrisX: 0.5,
      leftIrisY: 0.5,
      rightIrisX: 0.5,
      rightIrisY: 0.5,
      leftIrisNormalized: { x: 0.5, y: 0.5 },
      rightIrisNormalized: { x: 0.5, y: 0.5 },
      leftEyeOpenRatio: 0,
      rightEyeOpenRatio: 0,
      leftEye: { ...INVALID_EYE_METRICS, irisNormalized: { x: 0.5, y: 0.5 } },
      rightEye: { ...INVALID_EYE_METRICS, irisNormalized: { x: 0.5, y: 0.5 } },
      landmarkCount,
      yawDeg: 0,
      pitchDeg: 0,
      headPoseOk: false,
      faceInFrame: false,
      isBlinking: true,
      valid: false,
    };
  }

  // Face pose & frame boundaries — computed strictly from nose, forehead, chin, and cheek outline
  // so a closed or patched eye can never distort head-pose or framing checks.
  const nose = landmarks[LANDMARK_INDICES.NOSE_TIP];
  const forehead = landmarks[LANDMARK_INDICES.FOREHEAD_TOP];
  const chin = landmarks[LANDMARK_INDICES.CHIN_BOTTOM];
  const rightCheek = landmarks[LANDMARK_INDICES.RIGHT_CHEEK];
  const leftCheek = landmarks[LANDMARK_INDICES.LEFT_CHEEK];

  const outlineValid =
    isValidLandmark(nose) &&
    isValidLandmark(forehead) &&
    isValidLandmark(chin) &&
    isValidLandmark(rightCheek) &&
    isValidLandmark(leftCheek);

  let yawDeg = 0;
  let pitchDeg = 0;
  let headPoseOk = false;
  let faceInFrame = false;

  if (outlineValid) {
    const faceWidth = Math.max(0.01, Math.abs(leftCheek.x - rightCheek.x));
    const faceHeight = Math.max(0.01, Math.abs(chin.y - forehead.y));
    const faceCenterX = (rightCheek.x + leftCheek.x) / 2;
    const yawNorm = (nose.x - faceCenterX) / (faceWidth * 0.5);
    yawDeg = Number((yawNorm * 55).toFixed(1));

    // At neutral frontal gaze, nose tip sits near ~0.55 down from forehead to chin
    const noseVerticalRatio = (nose.y - forehead.y) / faceHeight;
    pitchDeg = Number(((noseVerticalRatio - 0.55) * 95).toFixed(1));

    headPoseOk =
      Math.abs(yawDeg) <= GAZE_CONFIG.MAX_HEAD_YAW_DEG &&
      Math.abs(pitchDeg) <= GAZE_CONFIG.MAX_HEAD_PITCH_DEG;

    const perimeterPoints = [forehead, chin, rightCheek, leftCheek];
    faceInFrame = perimeterPoints.every(
      (pt) =>
        pt.x >= GAZE_CONFIG.FACE_FRAME_MARGIN_MIN &&
        pt.x <= GAZE_CONFIG.FACE_FRAME_MARGIN_MAX &&
        pt.y >= GAZE_CONFIG.FACE_FRAME_MARGIN_MIN &&
        pt.y <= GAZE_CONFIG.FACE_FRAME_MARGIN_MAX
    );
  }

  // Evaluate each eye independently using ONLY that eye's own MediaPipe landmarks.
  const rightEye = extractSingleEye(landmarks, RIGHT_EYE_SPEC);
  const leftEye = extractSingleEye(landmarks, LEFT_EYE_SPEC);

  // Single-eye left mode: active gaze, blink, and validity depend ONLY on MediaPipe's left eye.
  if (eyeMode === 'left') {
    return {
      rawX: leftEye.offsetX,
      rawY: leftEye.offsetY,
      leftIrisX: leftEye.offsetX,
      leftIrisY: leftEye.offsetY,
      rightIrisX: 0.5,
      rightIrisY: 0.5,
      leftIrisNormalized: leftEye.irisNormalized,
      rightIrisNormalized: { x: 0.5, y: 0.5 },
      leftEyeOpenRatio: leftEye.openRatio,
      rightEyeOpenRatio: 0,
      leftEye,
      rightEye,
      landmarkCount,
      yawDeg,
      pitchDeg,
      headPoseOk,
      faceInFrame,
      isBlinking: leftEye.isBlinking,
      valid: leftEye.valid,
    };
  }

  // Single-eye right mode: active gaze, blink, and validity depend ONLY on MediaPipe's right eye.
  if (eyeMode === 'right') {
    return {
      rawX: rightEye.offsetX,
      rawY: rightEye.offsetY,
      leftIrisX: 0.5,
      leftIrisY: 0.5,
      rightIrisX: rightEye.offsetX,
      rightIrisY: rightEye.offsetY,
      leftIrisNormalized: { x: 0.5, y: 0.5 },
      rightIrisNormalized: rightEye.irisNormalized,
      leftEyeOpenRatio: 0,
      rightEyeOpenRatio: rightEye.openRatio,
      leftEye,
      rightEye,
      landmarkCount,
      yawDeg,
      pitchDeg,
      headPoseOk,
      faceInFrame,
      isBlinking: rightEye.isBlinking,
      valid: rightEye.valid,
    };
  }

  // Both-eyes mode: evaluates each eye independently and does NOT apply single-eye gates.
  const rawX = (leftEye.offsetX + rightEye.offsetX) / 2;
  const rawY = (leftEye.offsetY + rightEye.offsetY) / 2;

  return {
    rawX,
    rawY,
    leftIrisX: leftEye.offsetX,
    leftIrisY: leftEye.offsetY,
    rightIrisX: rightEye.offsetX,
    rightIrisY: rightEye.offsetY,
    leftIrisNormalized: leftEye.irisNormalized,
    rightIrisNormalized: rightEye.irisNormalized,
    leftEyeOpenRatio: leftEye.openRatio,
    rightEyeOpenRatio: rightEye.openRatio,
    leftEye,
    rightEye,
    landmarkCount,
    yawDeg,
    pitchDeg,
    headPoseOk,
    faceInFrame,
    isBlinking: leftEye.isBlinking && rightEye.isBlinking,
    valid: leftEye.valid && rightEye.valid,
  };
}

/**
 * Checks whether a rolling window of valid calibration frames has sufficient sample count
 * and low enough iris-offset standard deviation (fixation stability).
 */
export function computeRollingStability(
  samples: EyeLandmarkSample[],
  eyeMode: EyeMode
): RollingStabilityResult {
  const windowSamples = samples.slice(-GAZE_CONFIG.CALIBRATION_ROLLING_WINDOW_SIZE);
  const count = windowSamples.length;
  if (count === 0) {
    return { count: 0, stdX: Infinity, stdY: Infinity, isStable: false };
  }

  const xs = windowSamples.map((s) => getSampleFeature(s, eyeMode).x);
  const ys = windowSamples.map((s) => getSampleFeature(s, eyeMode).y);
  const stdX = standardDeviation(xs);
  const stdY = standardDeviation(ys);

  const isStable =
    count >= GAZE_CONFIG.CALIBRATION_MIN_STABLE_FRAMES &&
    stdX <= GAZE_CONFIG.CALIBRATION_MAX_IRIS_STD_X &&
    stdY <= GAZE_CONFIG.CALIBRATION_MAX_IRIS_STD_Y;

  return { count, stdX, stdY, isStable };
}

/**
 * Rejects outlier frames beyond CALIBRATION_OUTLIER_SD_MULTIPLIER (2 SD) of the median
 * before averaging the remaining frames for a calibration point.
 */
export function filterOutliersAndAverage(
  samples: EyeLandmarkSample[],
  eyeMode: EyeMode
): {
  rawX: number;
  rawY: number;
  leftIrisX: number;
  leftIrisY: number;
  rightIrisX: number;
  rightIrisY: number;
  keptCount: number;
  droppedCount: number;
} {
  if (samples.length === 0) {
    return {
      rawX: 0.5,
      rawY: 0.5,
      leftIrisX: 0.5,
      leftIrisY: 0.5,
      rightIrisX: 0.5,
      rightIrisY: 0.5,
      keptCount: 0,
      droppedCount: 0,
    };
  }

  const xs = samples.map((s) => getSampleFeature(s, eyeMode).x);
  const ys = samples.map((s) => getSampleFeature(s, eyeMode).y);
  const medX = median(xs);
  const medY = median(ys);
  const sdX = standardDeviation(xs);
  const sdY = standardDeviation(ys);
  const k = GAZE_CONFIG.CALIBRATION_OUTLIER_SD_MULTIPLIER;

  const inliers = samples.filter((s) => {
    const f = getSampleFeature(s, eyeMode);
    const okX = sdX < 1e-6 || Math.abs(f.x - medX) <= k * sdX;
    const okY = sdY < 1e-6 || Math.abs(f.y - medY) <= k * sdY;
    return okX && okY;
  });

  const kept = inliers.length >= 5 ? inliers : samples;

  return {
    rawX: Number(mean(kept.map((s) => s.rawX)).toFixed(5)),
    rawY: Number(mean(kept.map((s) => s.rawY)).toFixed(5)),
    leftIrisX: Number(mean(kept.map((s) => s.leftIrisX)).toFixed(5)),
    leftIrisY: Number(mean(kept.map((s) => s.leftIrisY)).toFixed(5)),
    rightIrisX: Number(mean(kept.map((s) => s.rightIrisX)).toFixed(5)),
    rightIrisY: Number(mean(kept.map((s) => s.rightIrisY)).toFixed(5)),
    keptCount: kept.length,
    droppedCount: samples.length - kept.length,
  };
}

/**
 * Verifies that the recorded 9 calibration points span a genuine eye-movement range
 * rather than staring at one spot or moving only the head.
 */
export function checkCalibrationSpread(
  points: CalibrationPointData[],
  eyeMode: EyeMode
): CalibrationSpreadCheckResult {
  if (points.length < 4) {
    return {
      valid: false,
      spreadX: 0,
      spreadY: 0,
      reason: 'Not enough calibration points were collected. Please complete all 9 dots.',
    };
  }

  const xs = points.map((p) => getSampleFeature(p, eyeMode).x);
  const ys = points.map((p) => getSampleFeature(p, eyeMode).y);

  const spreadX = Number((Math.max(...xs) - Math.min(...xs)).toFixed(5));
  const spreadY = Number((Math.max(...ys) - Math.min(...ys)).toFixed(5));

  if (
    spreadX < GAZE_CONFIG.MIN_CALIBRATION_SPREAD_X ||
    spreadY < GAZE_CONFIG.MIN_CALIBRATION_SPREAD_Y
  ) {
    return {
      valid: false,
      spreadX,
      spreadY,
      reason: `Eye movement range across the 9 targets was too small (horizontal spread ${spreadX.toFixed(
        3
      )}, vertical spread ${spreadY.toFixed(
        3
      )}). This happens when staring at a single spot or turning your head instead of moving your eyes. Keep your head steady and look directly at each dot.`,
    };
  }

  return { valid: true, spreadX, spreadY };
}

/**
 * Solves a small square linear system A * w = b via Gaussian elimination with partial pivoting.
 */
function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row, idx) => [...row, rhs[idx]]);

  for (let col = 0; col < n; col += 1) {
    // Partial pivoting
    let pivotRow = col;
    let maxVal = Math.abs(a[col][col]);
    for (let row = col + 1; row < n; row += 1) {
      const val = Math.abs(a[row][col]);
      if (val > maxVal) {
        maxVal = val;
        pivotRow = row;
      }
    }

    if (pivotRow !== col) {
      const tmp = a[col];
      a[col] = a[pivotRow];
      a[pivotRow] = tmp;
    }

    const pivot = Math.abs(a[col][col]) < 1e-10 ? 1e-10 : a[col][col];
    for (let j = col; j <= n; j += 1) {
      a[col][j] /= pivot;
    }

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) {
        a[row][j] -= factor * a[col][j];
      }
    }
  }

  return a.map((row) => row[n]);
}

function buildPolyFeatures(u: number, v: number): number[] {
  return [1, u, v, u * u, u * v, v * v];
}

/**
 * Fits a 2nd-order polynomial ridge regression mapping standardized iris-offset features (u, v)
 * to normalized viewport coordinates (screenXNorm, screenYNorm).
 */
export function fitPolynomialRidgeRegression(
  points: CalibrationPointData[],
  eyeMode: EyeMode,
  lambda: number = GAZE_CONFIG.RIDGE_REGULARIZATION_LAMBDA
): RegressionModel {
  const xs = points.map((p) => getSampleFeature(p, eyeMode).x);
  const ys = points.map((p) => getSampleFeature(p, eyeMode).y);
  const meanX = mean(xs);
  const meanY = mean(ys);
  const stdX = Math.max(1e-4, standardDeviation(xs, meanX));
  const stdY = Math.max(1e-4, standardDeviation(ys, meanY));

  const featureCount = 6;
  const ata: number[][] = Array.from({ length: featureCount }, () =>
    Array(featureCount).fill(0)
  );
  const atbx: number[] = Array(featureCount).fill(0);
  const atby: number[] = Array(featureCount).fill(0);

  for (const pt of points) {
    const f = getSampleFeature(pt, eyeMode);
    const u = (f.x - meanX) / stdX;
    const v = (f.y - meanY) / stdY;
    const phi = buildPolyFeatures(u, v);

    for (let i = 0; i < featureCount; i += 1) {
      atbx[i] += phi[i] * pt.screenXNorm;
      atby[i] += phi[i] * pt.screenYNorm;
      for (let j = 0; j < featureCount; j += 1) {
        ata[i][j] += phi[i] * phi[j];
      }
    }
  }

  // Regularize all non-intercept terms (ridge penalty)
  for (let i = 1; i < featureCount; i += 1) {
    ata[i][i] += lambda;
  }

  const weightsX = solveLinearSystem(ata, atbx).map((w) => Number(w.toFixed(6)));
  const weightsY = solveLinearSystem(ata, atby).map((w) => Number(w.toFixed(6)));

  return {
    meanX: Number(meanX.toFixed(6)),
    stdX: Number(stdX.toFixed(6)),
    meanY: Number(meanY.toFixed(6)),
    stdY: Number(stdY.toFixed(6)),
    weightsX,
    weightsY,
    lambda,
  };
}

export function predictFromRegression(
  model: RegressionModel,
  featureX: number,
  featureY: number
): { xNorm: number; yNorm: number } {
  const u = (featureX - model.meanX) / Math.max(1e-4, model.stdX);
  const v = (featureY - model.meanY) / Math.max(1e-4, model.stdY);
  const phi = buildPolyFeatures(u, v);

  let xNorm = 0;
  let yNorm = 0;
  for (let i = 0; i < phi.length; i += 1) {
    xNorm += (model.weightsX[i] ?? 0) * phi[i];
    yNorm += (model.weightsY[i] ?? 0) * phi[i];
  }
  return { xNorm, yNorm };
}

/**
 * Computes calibration reference bounds (unpadded observed min/max for extrapolation checks)
 * AND fits the 2nd-order polynomial ridge regression model for the selected tracking mode.
 */
export function computeCalibrationReferences(
  points: CalibrationPointData[],
  screenWidth: number,
  screenHeight: number,
  eyeMode: EyeMode = 'both'
): ReferenceValues {
  const xs = points.map((p) => getSampleFeature(p, eyeMode).x);
  const ys = points.map((p) => getSampleFeature(p, eyeMode).y);
  const lxs = points.map((p) => p.leftIrisX);
  const lys = points.map((p) => p.leftIrisY);
  const rxs = points.map((p) => p.rightIrisX);
  const rys = points.map((p) => p.rightIrisY);

  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);

  const regressionModel = fitPolynomialRidgeRegression(points, eyeMode);

  const centerPoint = points.find((p) => p.id === 5) || points[Math.floor(points.length / 2)];
  const centerFeature = centerPoint ? getSampleFeature(centerPoint, eyeMode) : null;
  const centerX = centerFeature ? centerFeature.x : (xMin + xMax) / 2;
  const centerY = centerFeature ? centerFeature.y : (yMin + yMax) / 2;

  let totalError = 0;
  for (const p of points) {
    const f = getSampleFeature(p, eyeMode);
    const pred = predictFromRegression(regressionModel, f.x, f.y);
    totalError += Math.hypot(pred.xNorm - p.screenXNorm, pred.yNorm - p.screenYNorm);
  }
  const avgNormError = points.length > 0 ? totalError / points.length : 0.4;
  const calibrationQuality = Math.round(clamp((1 - avgNormError * 2.2) * 100, 20, 99));

  return {
    xMin: Number(xMin.toFixed(5)),
    xMax: Number(xMax.toFixed(5)),
    yMin: Number(yMin.toFixed(5)),
    yMax: Number(yMax.toFixed(5)),
    screenWidth,
    screenHeight,
    centerX: Number(centerX.toFixed(5)),
    centerY: Number(centerY.toFixed(5)),
    calibrationQuality,
    regressionModel,
    leftEyeBounds: {
      xMin: Number(Math.min(...lxs).toFixed(5)),
      xMax: Number(Math.max(...lxs).toFixed(5)),
      yMin: Number(Math.min(...lys).toFixed(5)),
      yMax: Number(Math.max(...lys).toFixed(5)),
    },
    rightEyeBounds: {
      xMin: Number(Math.min(...rxs).toFixed(5)),
      xMax: Number(Math.max(...rxs).toFixed(5)),
      yMin: Number(Math.min(...rys).toFixed(5)),
      yMax: Number(Math.max(...rys).toFixed(5)),
    },
  };
}

/**
 * Maps an eye landmark sample to UNCLAMPED viewport pixel coordinates (rawX, rawY),
 * along with explicit feature-range extrapolation checks, pose/framing/lighting checks,
 * inBounds flag, gazeStatus, and confidence.
 *
 * NEVER silently clamps rawX/rawY to screen edges.
 */
export function mapGazeToScreen(
  sample: EyeLandmarkSample,
  reference: ReferenceValues | null,
  screenWidth: number,
  screenHeight: number,
  eyeMode: EyeMode = 'both',
  lightingOk = true
): MappedGazePoint {
  const ref = reference || DEFAULT_REFERENCE_VALUES;
  const { x: activeX, y: activeY } = getSampleFeature(sample, eyeMode);

  let xMin = ref.xMin;
  let xMax = ref.xMax;
  let yMin = ref.yMin;
  let yMax = ref.yMax;

  if (eyeMode === 'left' && ref.leftEyeBounds && ref.leftEyeBounds.xMax > ref.leftEyeBounds.xMin) {
    xMin = ref.leftEyeBounds.xMin;
    xMax = ref.leftEyeBounds.xMax;
    yMin = ref.leftEyeBounds.yMin;
    yMax = ref.leftEyeBounds.yMax;
  } else if (
    eyeMode === 'right' &&
    ref.rightEyeBounds &&
    ref.rightEyeBounds.xMax > ref.rightEyeBounds.xMin
  ) {
    xMin = ref.rightEyeBounds.xMin;
    xMax = ref.rightEyeBounds.xMax;
    yMin = ref.rightEyeBounds.yMin;
    yMax = ref.rightEyeBounds.yMax;
  }

  // Unclamped prediction (polynomial ridge regression when available, else unclamped linear)
  let rawXNorm: number;
  let rawYNorm: number;

  if (
    ref.regressionModel &&
    ref.regressionModel.weightsX.length === 6 &&
    ref.regressionModel.weightsY.length === 6
  ) {
    const pred = predictFromRegression(ref.regressionModel, activeX, activeY);
    rawXNorm = pred.xNorm;
    rawYNorm = pred.yNorm;
  } else {
    const xDenom = Math.max(0.005, xMax - xMin);
    const yDenom = Math.max(0.005, yMax - yMin);
    rawXNorm = (activeX - xMin) / xDenom;
    rawYNorm = (activeY - yMin) / yDenom;
  }

  const rawX = rawXNorm * screenWidth;
  const rawY = rawYNorm * screenHeight;

  // Feature-space range check: reject unreliable regression extrapolation outside calibrated iris range + margin
  const xSpan = Math.max(0.015, xMax - xMin);
  const ySpan = Math.max(0.015, yMax - yMin);
  const marginX = xSpan * GAZE_CONFIG.FEATURE_RANGE_MARGIN_RATIO;
  const marginY = ySpan * GAZE_CONFIG.FEATURE_RANGE_MARGIN_RATIO;

  const inFeatureBounds =
    activeX >= xMin - marginX &&
    activeX <= xMax + marginX &&
    activeY >= yMin - marginY &&
    activeY <= yMax + marginY;

  const tol = GAZE_CONFIG.CONTAINER_TOLERANCE_MARGIN_PX;
  const inScreenBounds =
    rawX >= -tol &&
    rawX <= screenWidth + tol &&
    rawY >= -tol &&
    rawY <= screenHeight + tol;

  const qualityOk =
    sample.valid &&
    !sample.isBlinking &&
    sample.headPoseOk &&
    sample.faceInFrame &&
    lightingOk;

  const inBounds = qualityOk && inFeatureBounds && inScreenBounds;

  let gazeStatus: GazeStatus = 'ok';
  if (!sample.valid) {
    gazeStatus = 'face-lost';
  } else if (!inBounds) {
    gazeStatus = 'off-screen';
  }

  let confidence = reference ? 0.88 : 0.55;
  if (!sample.valid) {
    confidence = 0;
  } else if (sample.isBlinking) {
    confidence = 0.15;
  } else if (!inFeatureBounds || !inScreenBounds || !sample.headPoseOk || !sample.faceInFrame) {
    confidence = 0.2;
  } else if (!lightingOk) {
    confidence = 0.3;
  }

  const clampedX = clamp(rawX, 0, screenWidth);
  const clampedY = clamp(rawY, 0, screenHeight);

  return {
    rawX,
    rawY,
    rawXNorm,
    rawYNorm,
    clampedX,
    clampedY,
    xNorm: rawXNorm,
    yNorm: rawYNorm,
    xScreen: rawX,
    yScreen: rawY,
    irisX: activeX,
    irisY: activeY,
    valid: sample.valid,
    inFeatureBounds,
    inScreenBounds,
    inBounds,
    headPoseOk: sample.headPoseOk,
    faceInFrame: sample.faceInFrame,
    lightingOk,
    isBlinking: sample.isBlinking,
    gazeStatus,
    confidence,
  };
}

/**
 * Converts unclamped viewport gaze coordinates into an actual game/stage container's
 * coordinate space using its bounding client rect.
 *
 * Hit detection MUST use containerX/containerY and require `valid && inBounds`.
 * Visual rendering may use clampedContainerX/clampedContainerY to pin the dot to the border.
 */
export function projectGazeToContainer(
  mapped: MappedGazePoint | null,
  rect: ContainerRectLike
): ContainerGazePoint {
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);

  if (!mapped || !mapped.valid) {
    return {
      containerX: width / 2,
      containerY: height / 2,
      clampedContainerX: width / 2,
      clampedContainerY: height / 2,
      containerXNorm: 0.5,
      containerYNorm: 0.5,
      valid: false,
      inContainerBounds: false,
      inBounds: false,
      gazeStatus: 'face-lost',
      confidence: 0,
    };
  }

  const containerX = mapped.rawX - rect.left;
  const containerY = mapped.rawY - rect.top;
  const tol = GAZE_CONFIG.CONTAINER_TOLERANCE_MARGIN_PX;

  const inContainerBounds =
    containerX >= -tol &&
    containerX <= width + tol &&
    containerY >= -tol &&
    containerY <= height + tol;

  const inBounds =
    mapped.valid &&
    !mapped.isBlinking &&
    mapped.headPoseOk &&
    mapped.faceInFrame &&
    mapped.lightingOk &&
    mapped.inFeatureBounds &&
    inContainerBounds;

  const gazeStatus: GazeStatus = !mapped.valid ? 'face-lost' : inBounds ? 'ok' : 'off-screen';

  return {
    containerX,
    containerY,
    clampedContainerX: clamp(containerX, 0, width),
    clampedContainerY: clamp(containerY, 0, height),
    containerXNorm: containerX / width,
    containerYNorm: containerY / height,
    valid: mapped.valid && !mapped.isBlinking,
    inContainerBounds,
    inBounds,
    gazeStatus,
    confidence: inBounds ? mapped.confidence : Math.min(mapped.confidence, 0.25),
  };
}

/**
 * Computes post-calibration 5-point validation error in pixels and as a percentage of container/screen width.
 */
export function evaluateValidationResults(
  points: ValidationPointInput[],
  referenceWidthPx: number
): ValidationError {
  const width = Math.max(1, referenceWidthPx);
  const pointErrors = points.map((pt) => {
    const errorPx = Math.hypot(pt.predictedX - pt.targetX, pt.predictedY - pt.targetY);
    return {
      id: pt.id,
      label: pt.label,
      errorPx: Number(errorPx.toFixed(1)),
    };
  });

  const errors = pointErrors.map((p) => p.errorPx);
  const meanErrorPx = errors.length > 0 ? Number(mean(errors).toFixed(1)) : 9999;
  const maxErrorPx = errors.length > 0 ? Number(Math.max(...errors).toFixed(1)) : 9999;
  const meanErrorPct = Number(((meanErrorPx / width) * 100).toFixed(2));
  const thresholdPct = GAZE_CONFIG.VALIDATION_MAX_MEAN_ERROR_PCT;
  const passed = errors.length > 0 && meanErrorPct <= thresholdPct;

  return {
    meanErrorPx,
    meanErrorPct,
    maxErrorPx,
    thresholdPct,
    passed,
    pointsEvaluated: pointErrors.length,
    pointErrors,
  };
}

/**
 * Exponential moving average filter to reduce webcam landmark jitter without introducing lag.
 * Operates on UNCLAMPED coordinates so smoothing never clamps off-screen gaze inside the screen.
 */
export class GazeSmoother {
  private prevX: number | null = null;
  private prevY: number | null = null;
  private readonly alpha: number;

  constructor(alpha: number = GAZE_CONFIG.GAZE_SMOOTHING_ALPHA) {
    this.alpha = alpha;
  }

  smooth(x: number, y: number): { x: number; y: number } {
    if (this.prevX === null || this.prevY === null) {
      this.prevX = x;
      this.prevY = y;
      return { x, y };
    }
    this.prevX = this.prevX + this.alpha * (x - this.prevX);
    this.prevY = this.prevY + this.alpha * (y - this.prevY);
    return { x: this.prevX, y: this.prevY };
  }

  reset(): void {
    this.prevX = null;
    this.prevY = null;
  }
}
