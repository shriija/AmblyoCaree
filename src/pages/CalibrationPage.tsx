import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ArrowRight,
  Crosshair,
  ShieldCheck,
  Eye,
  Info,
  PauseCircle,
  Clock,
  Target,
} from 'lucide-react';
import { useGazeTracker, type GazeFrameEvent } from '../hooks/useGazeTracker';
import {
  getMappingReferenceForMode,
  resolveEyeMode,
  useGazeStore,
} from '../store/useGazeStore';
import { useAuthStore } from '../store/useAuthStore';
import { WebcamPreview } from '../components/WebcamPreview';
import { EyeDebugPanel } from '../components/EyeDebugPanel';
import { calibrationApi, extractApiError } from '../services/api';
import {
  CALIBRATION_TARGETS,
  GAZE_CONFIG,
  VALIDATION_TARGETS,
} from '../utils/cv/gazeConfig';
import {
  checkCalibrationSpread,
  computeCalibrationReferences,
  computeRollingStability,
  evaluateValidationResults,
  filterOutliersAndAverage,
  mapGazeToScreen,
  projectGazeToContainer,
  type EyeLandmarkSample,
  type ValidationPointInput,
} from '../utils/cv/gazeEstimator';
import type {
  AffectedEye,
  CalibrationPointData,
  EyeMode,
  PracticeMode,
  ReferenceValues,
  ValidationError,
} from '../types';

type CalibrationStage =
  | 'setup'
  | 'calibrating'
  | 'validating'
  | 'saving'
  | 'complete'
  | 'rejected'
  | 'failed';

type PointPhase =
  | 'idle'
  | 'settling'
  | 'collecting'
  | 'unstable'
  | 'paused-gate'
  | 'timeout'
  | 'finishing';

interface CalibrationLoopState {
  mode: 'idle' | 'calibrating' | 'validating';
  phase: PointPhase;
  pointIndex: number;
  pointStartedAtMs: number | null;
  settleStartMs: number | null;
  samples: EyeLandmarkSample[];
  recordedPoints: CalibrationPointData[];
  validationPredictions: Array<{ x: number; y: number }>;
  validationInputs: ValidationPointInput[];
  consecutiveGateFailures: number;
  gateReason: string | null;
}

function formatModeLabel(mode: EyeMode): string {
  if (mode === 'left') return 'Left eye only';
  if (mode === 'right') return 'Right eye only';
  return 'Both eyes';
}

function getGateFailureReason(frame: GazeFrameEvent, eyeMode: EyeMode): string | null {
  if (!frame.faceDetected || !frame.sample || !frame.sample.valid) {
    if (eyeMode === 'left') {
      return "We can't detect your gaze. Keep your left eye open and visible.";
    }
    if (eyeMode === 'right') {
      return "We can't detect your gaze. Keep your right eye open and visible.";
    }
    if (frame.faceDetected && frame.sample) {
      if (!frame.sample.leftEye.valid && !frame.sample.rightEye.valid) {
        return 'Both eyes need clear visibility inside the webcam view.';
      }
      if (!frame.sample.leftEye.valid) {
        return 'Left eye landmarks unavailable — keep both eyes clearly visible.';
      }
      if (!frame.sample.rightEye.valid) {
        return 'Right eye landmarks unavailable — keep both eyes clearly visible.';
      }
    }
    return 'Face lost — center your face inside the webcam view.';
  }
  // Single-eye blink/closed gate applies ONLY in single-eye modes, never in both-eyes mode.
  if (frame.sample.isBlinking && eyeMode !== 'both') {
    return `We can't detect your gaze. Keep your ${eyeMode} eye open and visible.`;
  }
  if (!frame.sample.faceInFrame) {
    return 'Face clipped by camera edge — sit slightly further back so your whole face fits in frame.';
  }
  if (!frame.sample.headPoseOk) {
    return `Head turned or tilted (yaw ${Math.round(frame.sample.yawDeg)}°, pitch ${Math.round(
      frame.sample.pitchDeg
    )}°) — face straight ahead and move only your eyes.`;
  }
  if (!frame.lightingOk) {
    return 'Lighting is outside acceptable brightness range — improve even front lighting.';
  }
  return null;
}

export const CalibrationPage: React.FC = () => {
  const { user } = useAuthStore();
  const {
    calibration,
    affectedEye: storedAffectedEye,
    practiceMode: storedPracticeMode,
    setCalibration,
    updateCalibrationMode,
    selectedCameraId,
  } = useGazeStore();

  // Step 1: Eye selection state before calibration
  const [affectedEye, setAffectedEye] = useState<AffectedEye>(storedAffectedEye);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>(storedPracticeMode);
  const [modeSaving, setModeSaving] = useState(false);
  const [modeNotice, setModeNotice] = useState<string | null>(null);

  useEffect(() => {
    setAffectedEye(storedAffectedEye);
    setPracticeMode(storedPracticeMode);
  }, [storedAffectedEye, storedPracticeMode]);

  const trackingEyeMode: EyeMode = useMemo(
    () => resolveEyeMode(affectedEye, practiceMode),
    [affectedEye, practiceMode]
  );

  const activeModeMapping = calibration?.modeMappings?.[trackingEyeMode] || null;
  const activeModeReference = getMappingReferenceForMode(calibration, trackingEyeMode);

  // Calibration & Validation UI state (kept in sync from the ref-driven detection loop)
  const [stage, setStage] = useState<CalibrationStage>('setup');
  const [pointIndex, setPointIndex] = useState(0);
  const [pointPhase, setPointPhase] = useState<PointPhase>('idle');
  const [framesCollected, setFramesCollected] = useState(0);
  const [settleProgress, setSettleProgress] = useState(0);
  const [stabilityReadout, setStabilityReadout] = useState<{ stdX: number; stdY: number } | null>(
    null
  );
  const [gatePauseMessage, setGatePauseMessage] = useState<string | null>(null);
  const [recordedCount, setRecordedCount] = useState(0);
  const [computedRef, setComputedRef] = useState<ReferenceValues | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationError | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const arenaRef = useRef<HTMLDivElement | null>(null);
  const fittedRefRef = useRef<ReferenceValues | null>(null);
  const recordedPointsRef = useRef<CalibrationPointData[]>([]);

  // Ref-driven loop state so the continuous webcam detection loop never tears down or goes stale
  const calRef = useRef<CalibrationLoopState>({
    mode: 'idle',
    phase: 'idle',
    pointIndex: 0,
    pointStartedAtMs: null,
    settleStartMs: null,
    samples: [],
    recordedPoints: [],
    validationPredictions: [],
    validationInputs: [],
    consecutiveGateFailures: 0,
    gateReason: null,
  });

  const selectionRef = useRef({ affectedEye, practiceMode, trackingEyeMode });
  useEffect(() => {
    selectionRef.current = { affectedEye, practiceMode, trackingEyeMode };
  }, [affectedEye, practiceMode, trackingEyeMode]);

  const finishAndSaveValidatedCalibration = useCallback(
    async (
      points: CalibrationPointData[],
      refValues: ReferenceValues,
      validationError: ValidationError
    ) => {
      setValidationResult(validationError);

      if (!validationError.passed) {
        calRef.current.mode = 'idle';
        calRef.current.phase = 'idle';
        setPointPhase('idle');
        setStage('rejected');
        setStatusMessage(
          `Validation mean error was ${validationError.meanErrorPx} px (${validationError.meanErrorPct}% of screen width), which exceeds the ${validationError.thresholdPct}% accuracy threshold. Please keep your head steady, check front lighting, and recalibrate.`
        );
        return;
      }

      setStage('saving');
      setPointPhase('finishing');
      setStatusMessage(null);
      const { affectedEye: curAffected, practiceMode: curPractice } = selectionRef.current;

      try {
        const { calibration: saved } = await calibrationApi.save({
          affectedEye: curAffected,
          practiceMode: curPractice,
          calibrationPoints: points,
          referenceValues: refValues,
          validationError,
          calibrationStatus: 'completed',
        });

        setCalibration(saved);
        calRef.current.mode = 'idle';
        calRef.current.phase = 'idle';
        setPointPhase('idle');
        setStage('complete');
      } catch (err) {
        calRef.current.mode = 'idle';
        calRef.current.phase = 'idle';
        setPointPhase('idle');
        setStage('failed');
        setStatusMessage(
          extractApiError(
            err,
            'Calibration could not be saved. Please ensure your face is clearly visible and retry.'
          )
        );
      }
    },
    [setCalibration]
  );

  const beginValidationPhase = useCallback((points: CalibrationPointData[]) => {
    const { trackingEyeMode: curTrackMode } = selectionRef.current;

    // Step 1: Spread check — reject if user stared at one spot or only moved their head
    const spreadCheck = checkCalibrationSpread(points, curTrackMode);
    if (!spreadCheck.valid) {
      calRef.current.mode = 'idle';
      calRef.current.phase = 'idle';
      setPointPhase('idle');
      setValidationResult(null);
      setStage('rejected');
      setStatusMessage(
        spreadCheck.reason ||
          'Calibration rejected because iris movement range across the 9 dots was too small.'
      );
      return;
    }

    // Step 2: Fit 2nd-order polynomial ridge regression
    const refValues = computeCalibrationReferences(
      points,
      window.innerWidth,
      window.innerHeight,
      curTrackMode
    );
    fittedRefRef.current = refValues;
    recordedPointsRef.current = points;
    setComputedRef(refValues);

    // Step 3: Transition immediately to 5-point validation on unseen target positions
    calRef.current = {
      mode: 'validating',
      phase: 'settling',
      pointIndex: 0,
      pointStartedAtMs: null,
      settleStartMs: null,
      samples: [],
      recordedPoints: points,
      validationPredictions: [],
      validationInputs: [],
      consecutiveGateFailures: 0,
      gateReason: null,
    };

    setPointIndex(0);
    setPointPhase('settling');
    setFramesCollected(0);
    setSettleProgress(0);
    setStabilityReadout(null);
    setGatePauseMessage(null);
    setValidationResult(null);
    setStage('validating');
  }, []);

  // Continuous per-frame calibration & validation collector driven strictly via refs
  const handleFrame = useCallback(
    (frame: GazeFrameEvent) => {
      const state = calRef.current;
      if (state.mode === 'idle' || state.phase === 'idle' || state.phase === 'finishing' || state.phase === 'timeout') {
        return;
      }

      const nowMs = frame.timestamp;
      if (state.pointStartedAtMs === null) {
        state.pointStartedAtMs = nowMs;
      }

      const pointTimeoutMs =
        state.mode === 'validating'
          ? GAZE_CONFIG.VALIDATION_POINT_TIMEOUT_MS
          : GAZE_CONFIG.CALIBRATION_POINT_TIMEOUT_MS;

      // Never auto-skip: if a point exceeds its timeout, pause and offer Retry
      if (nowMs - state.pointStartedAtMs >= pointTimeoutMs) {
        state.phase = 'timeout';
        setPointPhase('timeout');
        setGatePauseMessage(
          `Point timed out after ${Math.round(pointTimeoutMs / 1000)} seconds before a steady fixation was recorded. Click Retry Point to try again.`
        );
        return;
      }

      // Check all strict collection gates simultaneously:
      // face detected, valid tracked-eye sample, head frontal, face inside frame, brightness OK
      const gateFailure = getGateFailureReason(frame, selectionRef.current.trackingEyeMode);
      if (gateFailure) {
        state.consecutiveGateFailures += 1;
        if (
          state.consecutiveGateFailures >= GAZE_CONFIG.CALIBRATION_FACE_LOST_FRAMES ||
          state.phase === 'paused-gate'
        ) {
          if (state.phase !== 'paused-gate' || state.gateReason !== gateFailure) {
            state.phase = 'paused-gate';
            state.gateReason = gateFailure;
            state.settleStartMs = null;
            // Clear unstable partial rolling buffer so looked-away frames are never mixed in
            state.samples = [];
            state.validationPredictions = [];
            setPointPhase('paused-gate');
            setGatePauseMessage(gateFailure);
            setFramesCollected(0);
            setSettleProgress(0);
            setStabilityReadout(null);
          }
        }
        return;
      }

      // All gates OK
      state.consecutiveGateFailures = 0;
      state.gateReason = null;

      if (state.phase === 'paused-gate') {
        state.phase = 'settling';
        state.settleStartMs = nowMs;
        setPointPhase('settling');
        setGatePauseMessage(null);
        setSettleProgress(0);
        return;
      }

      const requiredSettleMs =
        state.mode === 'validating'
          ? GAZE_CONFIG.VALIDATION_SETTLE_MS
          : GAZE_CONFIG.CALIBRATION_SACCADE_SETTLE_MS;

      // Discard initial ~400 ms after dot appears (saccade settling window)
      if (state.phase === 'settling') {
        if (state.settleStartMs === null) {
          state.settleStartMs = nowMs;
        }
        const elapsed = nowMs - state.settleStartMs;
        const pct = Math.min(100, Math.round((elapsed / requiredSettleMs) * 100));
        setSettleProgress(pct);

        if (elapsed >= requiredSettleMs) {
          state.phase = 'collecting';
          setPointPhase('collecting');
          setSettleProgress(100);
        }
        return;
      }

      const sample = frame.sample;
      if (!sample || sample.isBlinking) {
        return;
      }

      const arenaRect = arenaRef.current?.getBoundingClientRect() || {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };
      const curTrackMode = selectionRef.current.trackingEyeMode;

      // ─────────────────────────────────────────────────────────────────
      // MODE A: 9-POINT FIXATION-GATED CALIBRATION
      // ─────────────────────────────────────────────────────────────────
      if (state.mode === 'calibrating') {
        state.samples.push(sample);
        if (state.samples.length > GAZE_CONFIG.CALIBRATION_ROLLING_WINDOW_SIZE) {
          state.samples.shift();
        }

        const stability = computeRollingStability(state.samples, curTrackMode);
        setFramesCollected(Math.min(stability.count, GAZE_CONFIG.CALIBRATION_MIN_STABLE_FRAMES));

        if (stability.count >= GAZE_CONFIG.CALIBRATION_MIN_STABLE_FRAMES) {
          setStabilityReadout({
            stdX: Number(stability.stdX.toFixed(4)),
            stdY: Number(stability.stdY.toFixed(4)),
          });

          if (!stability.isStable) {
            if (state.phase !== 'unstable') {
              state.phase = 'unstable';
              setPointPhase('unstable');
            }
            return;
          }

          // Fixation confirmed! Drop > 2 SD outliers from median before averaging
          const filtered = filterOutliersAndAverage(state.samples, curTrackMode);
          const target = CALIBRATION_TARGETS[state.pointIndex];

          // Store target position in true normalized viewport coordinates so regression matches screen pixels
          const targetViewportX = arenaRect.left + target.xNorm * arenaRect.width;
          const targetViewportY = arenaRect.top + target.yNorm * arenaRect.height;
          const screenXNorm = Number((targetViewportX / Math.max(1, window.innerWidth)).toFixed(5));
          const screenYNorm = Number((targetViewportY / Math.max(1, window.innerHeight)).toFixed(5));

          const pointRecord: CalibrationPointData = {
            id: target.id,
            label: target.label,
            screenXNorm,
            screenYNorm,
            rawX: filtered.rawX,
            rawY: filtered.rawY,
            leftIrisX: filtered.leftIrisX,
            leftIrisY: filtered.leftIrisY,
            rightIrisX: filtered.rightIrisX,
            rightIrisY: filtered.rightIrisY,
            samplesCollected: filtered.keptCount,
          };

          state.recordedPoints = [...state.recordedPoints, pointRecord];
          state.samples = [];
          setRecordedCount(state.recordedPoints.length);
          setFramesCollected(0);
          setStabilityReadout(null);

          if (state.pointIndex + 1 < CALIBRATION_TARGETS.length) {
            state.pointIndex += 1;
            state.phase = 'settling';
            state.pointStartedAtMs = nowMs;
            state.settleStartMs = nowMs;
            setPointIndex(state.pointIndex);
            setPointPhase('settling');
            setSettleProgress(0);
          } else {
            state.phase = 'finishing';
            beginValidationPhase(state.recordedPoints);
          }
        } else if (state.phase !== 'collecting') {
          state.phase = 'collecting';
          setPointPhase('collecting');
        }
        return;
      }

      // ─────────────────────────────────────────────────────────────────
      // MODE B: 5-POINT POST-FIT VALIDATION
      // ─────────────────────────────────────────────────────────────────
      if (state.mode === 'validating' && fittedRefRef.current) {
        const mapped = mapGazeToScreen(
          sample,
          fittedRefRef.current,
          window.innerWidth,
          window.innerHeight,
          curTrackMode,
          frame.lightingOk
        );
        const projected = projectGazeToContainer(mapped, arenaRect);

        state.validationPredictions.push({
          x: projected.containerX,
          y: projected.containerY,
        });

        const count = state.validationPredictions.length;
        setFramesCollected(count);

        if (count >= GAZE_CONFIG.VALIDATION_SAMPLES_PER_POINT) {
          const valTarget = VALIDATION_TARGETS[state.pointIndex];
          const avgPredX =
            state.validationPredictions.reduce((sum, p) => sum + p.x, 0) / count;
          const avgPredY =
            state.validationPredictions.reduce((sum, p) => sum + p.y, 0) / count;

          state.validationInputs.push({
            id: valTarget.id,
            label: valTarget.label,
            targetX: valTarget.xNorm * arenaRect.width,
            targetY: valTarget.yNorm * arenaRect.height,
            predictedX: avgPredX,
            predictedY: avgPredY,
          });
          state.validationPredictions = [];
          setFramesCollected(0);

          if (state.pointIndex + 1 < VALIDATION_TARGETS.length) {
            state.pointIndex += 1;
            state.phase = 'settling';
            state.pointStartedAtMs = nowMs;
            state.settleStartMs = nowMs;
            setPointIndex(state.pointIndex);
            setPointPhase('settling');
            setSettleProgress(0);
          } else {
            state.phase = 'finishing';
            const evalResult = evaluateValidationResults(
              state.validationInputs,
              arenaRect.width
            );
            void finishAndSaveValidatedCalibration(
              recordedPointsRef.current,
              fittedRefRef.current,
              evalResult
            );
          }
        }
      }
    },
    [beginValidationPhase, finishAndSaveValidatedCalibration]
  );

  // Single continuous webcam stream & MediaPipe loop for the entire CalibrationPage lifecycle
  const {
    videoRef,
    overlayCanvasRef,
    cameraStatus,
    errorMessage,
    faceDetected,
    eyeSample,
    frameQuality,
    startCamera,
    stopCamera,
  } = useGazeTracker({
    referenceValues: activeModeReference,
    eyeMode: trackingEyeMode,
    preferredDeviceId: selectedCameraId || user?.preferences?.preferredCameraId,
    autoStart: false,
    onFrame: handleFrame,
  });

  const handleSelectionChange = async (
    nextAffectedEye: AffectedEye,
    nextPracticeMode: PracticeMode
  ) => {
    const normalizedPractice: PracticeMode =
      nextAffectedEye === 'not-sure' ? 'both-eyes' : nextPracticeMode;

    setAffectedEye(nextAffectedEye);
    setPracticeMode(normalizedPractice);
    setModeNotice(null);
    setValidationResult(null);
    setComputedRef(null);

    if (stage === 'complete' || stage === 'failed' || stage === 'rejected') {
      setStage('setup');
    }

    setModeSaving(true);
    try {
      const res = await updateCalibrationMode(nextAffectedEye, normalizedPractice);
      const nextTrack = resolveEyeMode(nextAffectedEye, normalizedPractice);
      if (res.requiresCalibration) {
        setModeNotice(
          `Switched to ${formatModeLabel(nextTrack)}. Please complete the 9-point calibration and 5-point validation for this mode.`
        );
      } else {
        setModeNotice(
          `Loaded your existing validated calibration mapping for ${formatModeLabel(nextTrack)}. You can train now, re-run validation, or recalibrate anytime.`
        );
      }
    } catch (err) {
      setModeNotice(extractApiError(err, 'Could not save eye selection mode.'));
    } finally {
      setModeSaving(false);
    }
  };

  const beginCalibrationSequence = () => {
    setStatusMessage(null);
    setModeNotice(null);
    setGatePauseMessage(null);
    setStabilityReadout(null);
    setValidationResult(null);
    fittedRefRef.current = null;
    recordedPointsRef.current = [];

    calRef.current = {
      mode: 'calibrating',
      phase: 'settling',
      pointIndex: 0,
      pointStartedAtMs: null,
      settleStartMs: null,
      samples: [],
      recordedPoints: [],
      validationPredictions: [],
      validationInputs: [],
      consecutiveGateFailures: 0,
      gateReason: null,
    };

    setPointIndex(0);
    setPointPhase('settling');
    setFramesCollected(0);
    setSettleProgress(0);
    setRecordedCount(0);
    setStage('calibrating');
  };

  // Re-run 5-point validation separately for the active mode's saved mapping
  const beginValidationOnly = () => {
    if (!activeModeMapping?.referenceValues) return;
    setStatusMessage(null);
    setModeNotice(null);
    setGatePauseMessage(null);
    setStabilityReadout(null);
    setValidationResult(null);

    fittedRefRef.current = activeModeMapping.referenceValues;
    recordedPointsRef.current = activeModeMapping.calibrationPoints;
    setComputedRef(activeModeMapping.referenceValues);
    setRecordedCount(activeModeMapping.calibrationPoints.length);

    calRef.current = {
      mode: 'validating',
      phase: 'settling',
      pointIndex: 0,
      pointStartedAtMs: null,
      settleStartMs: null,
      samples: [],
      recordedPoints: activeModeMapping.calibrationPoints,
      validationPredictions: [],
      validationInputs: [],
      consecutiveGateFailures: 0,
      gateReason: null,
    };

    setPointIndex(0);
    setPointPhase('settling');
    setFramesCollected(0);
    setSettleProgress(0);
    setStage('validating');
  };

  const retryCurrentPoint = () => {
    const state = calRef.current;
    state.phase = 'settling';
    state.pointStartedAtMs = performance.now();
    state.settleStartMs = performance.now();
    state.samples = [];
    state.validationPredictions = [];
    state.consecutiveGateFailures = 0;
    state.gateReason = null;

    setPointPhase('settling');
    setGatePauseMessage(null);
    setFramesCollected(0);
    setSettleProgress(0);
    setStabilityReadout(null);
  };

  const cancelCalibration = () => {
    calRef.current.mode = 'idle';
    calRef.current.phase = 'idle';
    calRef.current.samples = [];
    calRef.current.recordedPoints = [];
    calRef.current.validationPredictions = [];
    calRef.current.validationInputs = [];
    setPointPhase('idle');
    setGatePauseMessage(null);
    setFramesCollected(0);
    setSettleProgress(0);
    setStabilityReadout(null);
    setStage('setup');
  };

  const isArenaOpen = stage === 'calibrating' || stage === 'validating';
  const activeTargets = stage === 'validating' ? VALIDATION_TARGETS : CALIBRATION_TARGETS;
  const currentTarget = activeTargets[pointIndex] || activeTargets[0];
  const requiredSamples =
    stage === 'validating'
      ? GAZE_CONFIG.VALIDATION_SAMPLES_PER_POINT
      : GAZE_CONFIG.CALIBRATION_MIN_STABLE_FRAMES;
  const frameProgressPct = Math.min(100, Math.round((framesCollected / requiredSamples) * 100));
  const isSingleEyeMode = practiceMode === 'affected-eye-only' && affectedEye !== 'not-sure';
  const otherEyeName = affectedEye === 'left' ? 'right' : 'left';
  // Strictly read validation error for the active mode (never leak another mode's validation)
  const savedValidation = validationResult || activeModeMapping?.validationError || null;
  const liveGateFailure =
    cameraStatus === 'ready'
      ? getGateFailureReason(
          {
            faceDetected,
            sample: eyeSample,
            mapped: null,
            lightingOk: frameQuality ? frameQuality.brightnessOk : true,
            gazeStatus: faceDetected && eyeSample?.valid ? 'ok' : 'face-lost',
            timestamp: 0,
          },
          trackingEyeMode
        )
      : null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="rounded-2xl border border-[#E6E3FA] bg-white p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#6554E8]">
            Fixation-Gated 9-Point Calibration + 5-Point Validation
          </p>
          <h2 className="mt-1 font-display text-xl sm:text-2xl font-bold text-[#25234A]">
            Choose your eye mode & calibrate gaze mapping
          </h2>
          <p className="mt-1.5 text-sm text-[#5C597E] max-w-2xl">
            Each calibration dot waits for steady fixation with frontal head alignment and good
            lighting, fits a polynomial mapping, and verifies accuracy across 5 unseen validation
            points.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {cameraStatus === 'ready' ? (
            <button
              type="button"
              onClick={() => {
                cancelCalibration();
                stopCamera();
              }}
              className="rounded-lg border border-[#E6E3FA] px-4 py-2 text-xs font-semibold text-[#5C597E] hover:bg-[#F7F6FF] whitespace-nowrap"
            >
              Stop Camera
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startCamera()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#5342D6] whitespace-nowrap"
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
              Enable Webcam
            </button>
          )}
        </div>
      </div>

      {/* Active 9-Point Calibration & 5-Point Validation Arena (above persistent webcam so <video> NEVER unmounts) */}
      {isArenaOpen && (
        <section className="rounded-2xl border border-[#E6E3FA] bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E6E3FA] bg-[#F7F6FF]/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-semibold text-[#6554E8]">
                {stage === 'validating' ? 'Step 2/2: Validation' : 'Step 1/2: Calibration'}
              </span>
              <span aria-hidden="true" className="text-[#5C597E]">
                ·
              </span>
              <span className="font-semibold text-[#25234A] tabular-nums">
                Point {pointIndex + 1} of {activeTargets.length}: {currentTarget.label}
              </span>
              <span aria-hidden="true" className="text-[#5C597E]">
                ·
              </span>
              <span className="text-[#5C597E]">
                Tracking:{' '}
                <strong className="text-[#25234A]">{formatModeLabel(trackingEyeMode)}</strong>
              </span>
              <span aria-hidden="true" className="text-[#5C597E]">
                ·
              </span>
              <span className="font-mono tabular-nums text-[#25234A]">
                {pointPhase === 'timeout'
                  ? 'Timed out — retry required'
                  : pointPhase === 'paused-gate'
                    ? 'Paused — condition not met'
                    : pointPhase === 'unstable'
                      ? 'Hold your gaze steady on the dot'
                      : pointPhase === 'collecting'
                        ? `Collecting ${framesCollected}/${requiredSamples} valid frames`
                        : `Settling (${settleProgress}%)`}
              </span>
            </div>

            <button
              type="button"
              onClick={cancelCalibration}
              className="text-xs font-semibold text-[#5C597E] hover:text-[#25234A] whitespace-nowrap"
            >
              Cancel
            </button>
          </div>

          {/* Progress Bar */}
          <div className="h-1.5 w-full bg-[#E6E3FA]/70">
            <div
              className={`h-full transition-all duration-150 ${
                pointPhase === 'paused-gate' || pointPhase === 'timeout' || pointPhase === 'unstable'
                  ? 'bg-[#F2B84B]'
                  : stage === 'validating'
                    ? 'bg-[#35B779]'
                    : 'bg-[#6554E8]'
              }`}
              style={{
                width: `${Math.round(
                  ((pointIndex +
                    (pointPhase === 'collecting' || pointPhase === 'unstable'
                      ? framesCollected / requiredSamples
                      : 0)) /
                    activeTargets.length) *
                    100
                )}%`,
              }}
            />
          </div>

          {/* Clear Pause / Gate Notice */}
          {(pointPhase === 'paused-gate' || pointPhase === 'timeout') && gatePauseMessage && (
            <div
              role="alert"
              className="px-5 py-3 bg-[#FFF9EB] border-b border-[#F2B84B]/40 text-xs text-[#7D550E] flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5">
                {pointPhase === 'timeout' ? (
                  <Clock className="w-4 h-4 text-[#D98E16] shrink-0" aria-hidden="true" />
                ) : (
                  <PauseCircle className="w-4 h-4 text-[#D98E16] shrink-0" aria-hidden="true" />
                )}
                <span>
                  <strong>
                    Point {pointIndex + 1} ({currentTarget.label}) paused:
                  </strong>{' '}
                  {gatePauseMessage}
                </span>
              </div>

              {pointPhase === 'timeout' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={retryCurrentPoint}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#6554E8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#5342D6]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry Point
                  </button>
                  <button
                    type="button"
                    onClick={beginCalibrationSequence}
                    className="rounded-lg border border-[#E6E3FA] bg-white px-3 py-1.5 text-xs font-semibold text-[#25234A] hover:bg-[#F7F6FF]"
                  >
                    Restart All
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Target Arena */}
          <div
            ref={arenaRef}
            className="relative h-[480px] sm:h-[540px] w-full bg-[#F7F6FF] select-none"
          >
            {/* Center Guidance Card */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
              <div className="max-w-sm rounded-xl border border-[#E6E3FA] bg-white/95 px-5 py-4 pointer-events-auto">
                <p className="text-xs font-semibold text-[#25234A]">
                  {pointPhase === 'timeout'
                    ? `Point ${pointIndex + 1} timed out`
                    : pointPhase === 'paused-gate'
                      ? `Paused on "${currentTarget.label}"`
                      : pointPhase === 'unstable'
                        ? 'Hold your gaze steady on the dot'
                        : pointPhase === 'settling'
                          ? `Look directly at "${currentTarget.label}"`
                          : stage === 'validating'
                            ? `Validating accuracy on "${currentTarget.label}"`
                            : `Hold steady on "${currentTarget.label}"`}
                </p>
                <p className="mt-1 text-xs text-[#5C597E]">
                  {pointPhase === 'timeout'
                    ? 'Steady fixation was not reached within the time limit. Retry this point without losing earlier points.'
                    : pointPhase === 'paused-gate'
                      ? 'Keep your face centered, level, and evenly lit. This point will not be skipped.'
                      : pointPhase === 'unstable'
                        ? 'Iris signal is moving too much to lock fixation. Keep your head still and fixate on the dot center.'
                        : pointPhase === 'settling'
                          ? 'Ignoring initial eye movement (~0.4s) before sampling...'
                          : `Collecting ${framesCollected} of ${requiredSamples} valid frames — advances when fixation is steady.`}
                </p>

                {stabilityReadout && stage === 'calibrating' && (
                  <p className="mt-1.5 font-mono text-[11px] text-[#5C597E] tabular-nums">
                    Iris SD X: {stabilityReadout.stdX.toFixed(3)} (max{' '}
                    {GAZE_CONFIG.CALIBRATION_MAX_IRIS_STD_X}) · Y:{' '}
                    {stabilityReadout.stdY.toFixed(3)} (max {GAZE_CONFIG.CALIBRATION_MAX_IRIS_STD_Y})
                  </p>
                )}

                {pointPhase === 'timeout' ? (
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={retryCurrentPoint}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#6554E8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5342D6]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Retry Point
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 h-2 w-full rounded-full bg-[#E6E3FA] overflow-hidden">
                    <div
                      className={`h-full transition-all duration-100 ${
                        pointPhase === 'paused-gate' || pointPhase === 'unstable'
                          ? 'bg-[#F2B84B]'
                          : pointPhase === 'collecting'
                            ? 'bg-[#35B779]'
                            : 'bg-[#A99BF7]'
                      }`}
                      style={{
                        width: `${
                          pointPhase === 'collecting' || pointPhase === 'unstable'
                            ? frameProgressPct
                            : settleProgress
                        }%`,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Calibration or Validation Targets */}
            {activeTargets.map((pt, idx) => {
              const isCompleted = idx < pointIndex;
              const isActive = idx === pointIndex;
              const ringSize = 68;
              const r = 28;
              const circ = 2 * Math.PI * r;
              const dashOffset =
                pointPhase === 'collecting' || pointPhase === 'unstable'
                  ? circ * (1 - framesCollected / requiredSamples)
                  : circ * (1 - (settleProgress / 100) * 0.2);

              return (
                <div
                  key={`${stage}-${pt.id}`}
                  aria-label={`${stage === 'validating' ? 'Validation' : 'Calibration'} target ${pt.id}: ${pt.label}`}
                  style={{
                    left: `${pt.xNorm * 100}%`,
                    top: `${pt.yNorm * 100}%`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                >
                  {isActive && (
                    <svg
                      width={ringSize}
                      height={ringSize}
                      className="absolute -rotate-90 pointer-events-none"
                    >
                      <circle
                        cx={ringSize / 2}
                        cy={ringSize / 2}
                        r={r}
                        fill="none"
                        stroke="#E6E3FA"
                        strokeWidth="4"
                      />
                      <circle
                        cx={ringSize / 2}
                        cy={ringSize / 2}
                        r={r}
                        fill="none"
                        stroke={
                          pointPhase === 'paused-gate' ||
                          pointPhase === 'timeout' ||
                          pointPhase === 'unstable'
                            ? '#F2B84B'
                            : pointPhase === 'collecting'
                              ? '#35B779'
                              : '#6554E8'
                        }
                        strokeWidth="4"
                        strokeDasharray={circ}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                      />
                    </svg>
                  )}

                  <div
                    className={`rounded-full flex items-center justify-center transition-transform duration-150 ${
                      isActive
                        ? pointPhase === 'paused-gate' ||
                          pointPhase === 'timeout' ||
                          pointPhase === 'unstable'
                          ? 'w-12 h-12 bg-[#F2B84B] text-[#25234A] shadow-md'
                          : pointPhase === 'collecting'
                            ? 'w-12 h-12 bg-[#35B779] text-white shadow-md'
                            : 'w-12 h-12 bg-[#6554E8] text-white shadow-md'
                        : isCompleted
                          ? 'w-8 h-8 bg-[#35B779] text-white'
                          : 'w-7 h-7 bg-white border border-[#E6E3FA] text-[#5C597E] opacity-60'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isActive ? (
                      <span className="font-mono text-xs font-bold tabular-nums">
                        {pointPhase === 'collecting'
                          ? `${frameProgressPct}%`
                          : pointPhase === 'paused-gate' ||
                              pointPhase === 'timeout' ||
                              pointPhase === 'unstable'
                            ? '!'
                            : stage === 'validating'
                              ? `V${pt.id}`
                              : pt.id}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px]">
                        {stage === 'validating' ? `V${pt.id}` : pt.id}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Persistent Main 2-Column Workspace (WebcamPreview NEVER unmounts across stage transitions) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Persistent Single Webcam Stream & Landmark Overlay */}
        <div className="lg:col-span-5 space-y-4">
          <WebcamPreview
            videoRef={videoRef}
            overlayCanvasRef={overlayCanvasRef}
            cameraStatus={cameraStatus}
            faceDetected={faceDetected}
            frameQuality={frameQuality}
            errorMessage={errorMessage}
            compact={isArenaOpen}
            onStartCamera={() => void startCamera()}
          />

          {cameraStatus === 'ready' && (
            <EyeDebugPanel
              eyeSample={eyeSample}
              eyeMode={trackingEyeMode}
              faceDetected={faceDetected}
              frameQuality={frameQuality}
              activeGateFailure={liveGateFailure}
              compact={isArenaOpen}
            />
          )}

          <div className="rounded-xl border border-[#E6E3FA] bg-white p-4 flex items-start gap-3 text-xs text-[#5C597E]">
            <ShieldCheck className="w-4 h-4 text-[#35B779] shrink-0 mt-0.5" aria-hidden="true" />
            <p className="leading-relaxed">
              Video stays local in your browser. Standard webcam landmark tracking is an interactive
              training aid—not clinical-grade eye tracking.
            </p>
          </div>
        </div>

        {/* Right: Step 1 Eye Selection + Status + Calibration Trigger */}
        <div className="lg:col-span-7 space-y-5">
          {/* Saving / Rejected / Failed / Complete Feedback Panels */}
          {stage === 'saving' && (
            <div className="rounded-2xl border border-[#E6E3FA] bg-white p-7 text-center">
              <div className="w-8 h-8 border-2 border-[#6554E8] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="font-display font-bold text-[#25234A]">
                Saving validated calibration for {formatModeLabel(trackingEyeMode)}...
              </p>
              <p className="mt-1 text-xs text-[#5C597E]">
                Storing polynomial ridge model and 5-point validation error from {recordedCount}{' '}
                fixation points.
              </p>
            </div>
          )}

          {(stage === 'rejected' || stage === 'failed') && (
            <div className="rounded-2xl border border-[#E76B75]/45 bg-white p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[#E76B75] shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-display text-base font-bold text-[#25234A]">
                    {stage === 'rejected'
                      ? 'Calibration did not pass quality validation'
                      : 'Calibration could not be saved'}
                  </h3>
                  <p className="mt-1 text-sm text-[#5C597E] leading-relaxed">{statusMessage}</p>

                  {validationResult && (
                    <div className="mt-3 grid grid-cols-3 gap-2.5 rounded-xl bg-[#FFF5F6] border border-[#E76B75]/25 p-3 text-xs font-mono tabular-nums">
                      <div>
                        <span className="block font-sans text-[11px] text-[#5C597E]">
                          Mean Error
                        </span>
                        <strong className="text-[#C24550]">{validationResult.meanErrorPx} px</strong>
                      </div>
                      <div>
                        <span className="block font-sans text-[11px] text-[#5C597E]">
                          % of Width
                        </span>
                        <strong className="text-[#C24550]">
                          {validationResult.meanErrorPct}%
                        </strong>
                      </div>
                      <div>
                        <span className="block font-sans text-[11px] text-[#5C597E]">
                          Required Max
                        </span>
                        <strong className="text-[#25234A]">
                          ≤ {validationResult.thresholdPct}%
                        </strong>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={beginCalibrationSequence}
                    disabled={cameraStatus !== 'ready'}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5342D6] disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Recalibrate
                  </button>
                </div>
              </div>
            </div>
          )}

          {stage === 'complete' && (computedRef || activeModeReference) && (
            <div className="rounded-2xl border border-[#35B779]/40 bg-white p-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#35B779] shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-display text-base font-bold text-[#25234A]">
                    Calibration validated & saved for {formatModeLabel(trackingEyeMode)}
                  </h3>
                  <p className="mt-1 text-xs text-[#5C597E]">
                    9 fixation-gated calibration points were fitted with ridge regression and
                    verified across 5 unseen validation targets.
                  </p>

                  {savedValidation && (
                    <div className="mt-3.5 grid grid-cols-3 gap-3 rounded-xl bg-[#F3FBF7] border border-[#35B779]/25 p-3.5 text-xs font-mono tabular-nums">
                      <div>
                        <span className="block text-[11px] font-sans text-[#5C597E]">
                          Validation Mean Error
                        </span>
                        <strong className="text-[#238858]">{savedValidation.meanErrorPx} px</strong>
                      </div>
                      <div>
                        <span className="block text-[11px] font-sans text-[#5C597E]">
                          % of Width
                        </span>
                        <strong className="text-[#238858]">
                          {savedValidation.meanErrorPct}%
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[11px] font-sans text-[#5C597E]">
                          Pass Threshold
                        </span>
                        <strong className="text-[#25234A]">
                          ≤ {savedValidation.thresholdPct}%
                        </strong>
                      </div>
                    </div>
                  )}

                  {(() => {
                    const ref = computedRef || activeModeReference!;
                    return (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-[#F7F6FF] p-3.5 text-xs font-mono tabular-nums">
                        <div>
                          <span className="block text-[11px] font-sans text-[#5C597E]">Xmin</span>
                          <strong className="text-[#25234A]">{ref.xMin.toFixed(4)}</strong>
                        </div>
                        <div>
                          <span className="block text-[11px] font-sans text-[#5C597E]">Xmax</span>
                          <strong className="text-[#25234A]">{ref.xMax.toFixed(4)}</strong>
                        </div>
                        <div>
                          <span className="block text-[11px] font-sans text-[#5C597E]">Ymin</span>
                          <strong className="text-[#25234A]">{ref.yMin.toFixed(4)}</strong>
                        </div>
                        <div>
                          <span className="block text-[11px] font-sans text-[#5C597E]">Ymax</span>
                          <strong className="text-[#25234A]">{ref.yMax.toFixed(4)}</strong>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Link
                      to="/training"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#6554E8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5342D6]"
                    >
                      Start Training Games
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                    <Link
                      to="/gaze-tracking"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#E6E3FA] px-4 py-2 text-xs font-semibold text-[#25234A] hover:bg-[#F7F6FF]"
                    >
                      Verify in Gaze Tracking
                    </Link>
                    <button
                      type="button"
                      onClick={beginCalibrationSequence}
                      disabled={cameraStatus !== 'ready'}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5C597E] hover:text-[#25234A]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Recalibrate
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Eye Selection Before Calibration */}
          <section className="rounded-2xl border border-[#E6E3FA] bg-white p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#6554E8]">Step 1 · Eye Selection</p>
                <h3 className="mt-0.5 font-display text-base font-bold text-[#25234A]">
                  Configure eye tracking before calibrating
                </h3>
              </div>
              {modeSaving && <span className="text-xs text-[#5C597E]">Saving mode...</span>}
            </div>

            {/* Question 1: Which eye is affected? */}
            <div>
              <p className="text-xs font-semibold text-[#25234A]">Which eye is affected?</p>
              <div className="mt-2 grid grid-cols-3 gap-2.5">
                {(
                  [
                    { id: 'left', label: 'Left' },
                    { id: 'right', label: 'Right' },
                    { id: 'not-sure', label: 'Not sure' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isArenaOpen || modeSaving}
                    onClick={() => void handleSelectionChange(opt.id, practiceMode)}
                    className={`rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50 ${
                      affectedEye === opt.id
                        ? 'border-[#6554E8] bg-[#F0EDFF] text-[#6554E8]'
                        : 'border-[#E6E3FA] bg-white text-[#5C597E] hover:bg-[#F7F6FF] hover:text-[#25234A]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Question 2: Practice with */}
            <div>
              <p className="text-xs font-semibold text-[#25234A]">Practice with:</p>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={isArenaOpen || modeSaving || affectedEye === 'not-sure'}
                  onClick={() => void handleSelectionChange(affectedEye, 'affected-eye-only')}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    practiceMode === 'affected-eye-only' && affectedEye !== 'not-sure'
                      ? 'border-[#6554E8] bg-[#F0EDFF]/80'
                      : 'border-[#E6E3FA] bg-white hover:bg-[#F7F6FF]'
                  }`}
                >
                  <span className="block text-xs font-semibold text-[#25234A]">
                    Affected eye only
                    {affectedEye !== 'not-sure'
                      ? ` (${affectedEye === 'left' ? 'Left' : 'Right'})`
                      : ''}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[#5C597E]">
                    Tracks only that eye&apos;s iris relative to its own corners.
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isArenaOpen || modeSaving}
                  onClick={() => void handleSelectionChange(affectedEye, 'both-eyes')}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                    practiceMode === 'both-eyes' || affectedEye === 'not-sure'
                      ? 'border-[#6554E8] bg-[#F0EDFF]/80'
                      : 'border-[#E6E3FA] bg-white hover:bg-[#F7F6FF]'
                  }`}
                >
                  <span className="block text-xs font-semibold text-[#25234A]">Both eyes</span>
                  <span className="mt-0.5 block text-[11px] text-[#5C597E]">
                    Calibrates using both irises averaged together.
                  </span>
                </button>
              </div>
              {affectedEye === 'not-sure' && (
                <p className="mt-2 text-xs text-[#5C597E]">
                  Select <strong>Left</strong> or <strong>Right</strong> above to enable single-eye
                  tracking, or continue calibrating with both eyes.
                </p>
              )}
            </div>

            {/* Honest Single-Eye Tracking & Occlusion Note */}
            {isSingleEyeMode && (
              <div className="rounded-xl border border-[#E6E3FA] bg-[#F7F6FF] p-4 flex items-start gap-3 text-xs text-[#5C597E]">
                <Eye className="w-4 h-4 text-[#6554E8] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1.5 leading-relaxed">
                  <p className="font-semibold text-[#25234A]">
                    Single-eye tracking ({affectedEye === 'left' ? 'Left' : 'Right'} eye iris only)
                  </p>
                  <p className="font-medium text-[#25234A]">
                    Use an eye patch or cover the other eye. Closing it by squeezing can distort
                    tracking.
                  </p>
                  <p>
                    All gaze validity checks in this mode depend only on your {affectedEye} eye—your{' '}
                    {otherEyeName} eye&apos;s landmarks are ignored.{' '}
                    <strong className="text-[#25234A]">
                      AmblyoCare does not occlude the other eye.
                    </strong>{' '}
                    This mode provides single-eye webcam landmark tracking, not clinical eye
                    isolation or medical treatment.
                  </p>
                </div>
              </div>
            )}

            {modeNotice && (
              <div className="rounded-xl border border-[#E6E3FA] bg-[#F7F6FF]/70 px-4 py-2.5 text-xs text-[#25234A] flex items-start gap-2">
                <Info className="w-4 h-4 text-[#6554E8] shrink-0 mt-0.5" />
                <span>{modeNotice}</span>
              </div>
            )}

            {/* Saved Calibration Status per Mode */}
            <div className="pt-4 border-t border-[#E6E3FA]">
              <p className="text-xs font-semibold text-[#25234A]">
                Saved calibration status by mode
              </p>
              <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                {(['both', 'left', 'right'] as EyeMode[]).map((modeKey) => {
                  const savedMapping = calibration?.modeMappings?.[modeKey];
                  const isCurrent = trackingEyeMode === modeKey;
                  const valErr = savedMapping?.validationError;
                  return (
                    <div
                      key={modeKey}
                      className={`rounded-lg border px-3 py-2.5 ${
                        isCurrent
                          ? 'border-[#6554E8]/50 bg-[#F7F6FF]'
                          : 'border-[#E6E3FA] bg-white'
                      }`}
                    >
                      <p className="font-semibold text-[#25234A]">{formatModeLabel(modeKey)}</p>
                      <p
                        className={`mt-0.5 text-[11px] tabular-nums ${
                          savedMapping ? 'text-[#238858] font-medium' : 'text-[#5C597E]'
                        }`}
                      >
                        {savedMapping
                          ? valErr
                            ? `Validated · ${valErr.meanErrorPct}% err`
                            : `Calibrated · ${new Date(savedMapping.calibratedAt).toLocaleDateString(
                                'en-US',
                                { month: 'short', day: 'numeric' }
                              )}`
                          : isCurrent
                            ? 'Calibration required'
                            : 'Not calibrated'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Step 2: Launch 9-Point Fixation-Gated Calibration + 5-Point Validation */}
          <section className="rounded-2xl border border-[#E6E3FA] bg-white p-6">
            <p className="text-xs font-semibold text-[#6554E8]">
              Step 2 · Fixation-Gated Calibration & Accuracy Check
            </p>
            <h3 className="mt-0.5 font-display text-base font-bold text-[#25234A]">
              How calibration validity is enforced
            </h3>
            <ol className="mt-3.5 space-y-2.5 text-sm text-[#5C597E]">
              <li className="flex gap-3">
                <span className="font-mono text-xs font-semibold text-[#6554E8] mt-0.5">01</span>
                <span>
                  Frames are accepted only while your face is fully in view, frontal (head yaw/pitch
                  within ±{GAZE_CONFIG.MAX_HEAD_YAW_DEG}°), and evenly lit.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-xs font-semibold text-[#6554E8] mt-0.5">02</span>
                <span>
                  Each of the 9 dots discards the first {GAZE_CONFIG.CALIBRATION_SACCADE_SETTLE_MS}
                  ms of eye travel, requires at least {GAZE_CONFIG.CALIBRATION_MIN_STABLE_FRAMES}{' '}
                  steady frames in a rolling window, and rejects outliers beyond 2 SD before
                  averaging.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-xs font-semibold text-[#6554E8] mt-0.5">03</span>
                <span>
                  After checking genuine eye-movement spread and fitting a ridge polynomial model, 5
                  unseen validation points verify mean error is ≤{' '}
                  {GAZE_CONFIG.VALIDATION_MAX_MEAN_ERROR_PCT}% of width before saving.
                </span>
              </li>
            </ol>

            <div className="mt-6 pt-5 border-t border-[#E6E3FA] flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-[#5C597E] flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-[#6554E8]" aria-hidden="true" />
                <span>
                  Active mode:{' '}
                  <strong className="text-[#25234A]">{formatModeLabel(trackingEyeMode)}</strong> ·{' '}
                  {activeModeMapping?.validationError?.passed ? (
                    <span className="text-[#238858] font-medium">
                      Validated ({activeModeMapping.validationError.meanErrorPct}% err)
                    </span>
                  ) : activeModeMapping ? (
                    <span className="text-[#A87518] font-medium">Validation required</span>
                  ) : (
                    <span className="text-[#A87518] font-medium">Needs calibration</span>
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {activeModeMapping && (
                  <button
                    type="button"
                    onClick={beginValidationOnly}
                    disabled={isArenaOpen || cameraStatus !== 'ready' || !faceDetected}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E6E3FA] bg-white px-4 py-2.5 text-xs font-semibold text-[#25234A] hover:bg-[#F7F6FF] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#35B779]" aria-hidden="true" />
                    Re-run Validation (5 pts)
                  </button>
                )}

                <button
                  type="button"
                  onClick={beginCalibrationSequence}
                  disabled={isArenaOpen || cameraStatus !== 'ready' || !faceDetected}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#5342D6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  <Crosshair className="w-4 h-4" aria-hidden="true" />
                  {activeModeMapping
                    ? `Recalibrate (${formatModeLabel(trackingEyeMode)})`
                    : `Start Calibration (${formatModeLabel(trackingEyeMode)})`}
                </button>
              </div>
            </div>

            {cameraStatus !== 'ready' && (
              <p className="mt-2.5 text-xs text-[#5C597E]">
                Click <strong>Enable Webcam</strong> above first so AmblyoCare can detect your eye
                landmarks.
              </p>
            )}
            {cameraStatus === 'ready' && !faceDetected && (
              <p className="mt-2.5 text-xs text-[#A87518]">
                Waiting for face and iris detection. Center your face in the webcam preview to
                begin.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
