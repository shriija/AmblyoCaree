import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Play,
  Pause,
  RotateCcw,
  Square,
  Camera,
  MousePointer2,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Crosshair,
  AlertCircle,
  EyeOff,
} from 'lucide-react';
import { useGazeTracker, type GazeFrameEvent } from '../hooks/useGazeTracker';
import { getMappingReferenceForMode, useGazeStore } from '../store/useGazeStore';
import { useAuthStore } from '../store/useAuthStore';
import { GazeIndicator } from '../components/GazeIndicator';
import { WebcamPreview } from '../components/WebcamPreview';
import { extractApiError, trainingApi } from '../services/api';
import { GAZE_CONFIG } from '../utils/cv/gazeConfig';
import { projectGazeToContainer } from '../utils/cv/gazeEstimator';
import type {
  DifficultyAdjustment,
  DifficultyLevel,
  DifficultyParams,
  EyeMode,
  GameType,
  GazeStatus,
  TrainingSession,
} from '../types';

const DEFAULT_PARAMS: DifficultyParams = {
  targetSizePx: 84,
  targetSpeed: 1.0,
  targetDistanceRatio: 0.48,
  targetCount: 10,
  responseTimeMs: 4200,
  holdDurationMs: 1400,
};

const GAMES: Array<{
  id: GameType;
  title: string;
  subtitle: string;
  instruction: string;
}> = [
  {
    id: 'catch-targets',
    title: 'Catch the Targets',
    subtitle: 'Saccadic localization & reaction',
    instruction:
      'Look directly at each appearing purple target until it locks in. Move swiftly to maximize accuracy and minimize reaction time.',
  },
  {
    id: 'follow-object',
    title: 'Follow the Moving Object',
    subtitle: 'Smooth-pursuit visual tracking',
    instruction:
      'Keep your gaze smoothly aligned with the gliding target as it travels across the arena.',
  },
  {
    id: 'focus-hold',
    title: 'Focus and Hold',
    subtitle: 'Sustained visual fixation',
    instruction:
      'Fixate steadily on the stationary target until the outer progress ring completes.',
  },
];

type RunState = 'idle' | 'running' | 'paused' | 'auto-paused' | 'finished';

interface TargetState {
  id: number;
  x: number; // normalized 0..1 within arena
  y: number; // normalized 0..1 within arena
  spawnedAt: number;
  firstFocusAt: number | null;
  dwellMs: number;
}

interface ContainerGazeRefState {
  // Unclamped container-local coords (STRICTLY used for hit detection)
  containerX: number;
  containerY: number;
  // Edge-clamped coords (STRICTLY for visual GazeIndicator display)
  clampedX: number;
  clampedY: number;
  valid: boolean;
  inBounds: boolean;
  gazeStatus: GazeStatus;
}

function getGazeStatusDisplay(status: GazeStatus): { label: string; colorClass: string; dotClass: string } {
  if (status === 'ok') {
    return { label: 'Tracking OK', colorClass: 'text-[#238858]', dotClass: 'bg-[#35B779]' };
  }
  if (status === 'off-screen') {
    return { label: 'Off-screen', colorClass: 'text-[#A87518]', dotClass: 'bg-[#F2B84B]' };
  }
  return { label: 'Face lost', colorClass: 'text-[#C24550]', dotClass: 'bg-[#E76B75]' };
}

export const TrainingPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialGameParam = searchParams.get('game') as GameType | null;
  const initialGame: GameType =
    initialGameParam && ['catch-targets', 'follow-object', 'focus-hold'].includes(initialGameParam)
      ? initialGameParam
      : 'catch-targets';

  const { user } = useAuthStore();
  const {
    calibration,
    affectedEye,
    practiceMode,
    inputMode,
    setInputMode,
    activeEyeMode,
    setActiveEyeMode,
    updateCalibrationMode,
    selectedCameraId,
  } = useGazeStore();

  const activeModeReference = getMappingReferenceForMode(calibration, activeEyeMode);
  const modeRequiresCalibration = inputMode === 'webcam' && !activeModeReference;

  const [selectedGame, setSelectedGame] = useState<GameType>(initialGame);
  const [difficultyLevel, setDifficultyLevel] = useState<DifficultyLevel>('beginner');
  const [adaptiveParams, setAdaptiveParams] = useState<DifficultyParams>(DEFAULT_PARAMS);
  const [adaptiveEnabled, setAdaptiveEnabled] = useState(true);
  const [lastAdjustmentNote, setLastAdjustmentNote] = useState<string>('');

  const [runState, setRunState] = useState<RunState>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [score, setScore] = useState(0);
  const [targetsHit, setTargetsHit] = useState(0);
  const [targetsMissed, setTargetsMissed] = useState(0);
  const [avgReactionMs, setAvgReactionMs] = useState(0);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [liveGazeStatus, setLiveGazeStatus] = useState<GazeStatus>('face-lost');
  const [indicatorPos, setIndicatorPos] = useState<{
    x: number;
    y: number;
    visible: boolean;
    offScreen: boolean;
  }>({ x: 360, y: 220, visible: false, offScreen: false });

  const [target, setTarget] = useState<TargetState>({
    id: 1,
    x: 0.5,
    y: 0.5,
    spawnedAt: 0,
    firstFocusAt: null,
    dwellMs: 0,
  });
  const [isGazeOnTarget, setIsGazeOnTarget] = useState(false);

  const [savingSession, setSavingSession] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [completedSummary, setCompletedSummary] = useState<{
    session: TrainingSession;
    adjustment: DifficultyAdjustment;
  } | null>(null);

  const arenaRef = useRef<HTMLDivElement | null>(null);
  const sessionDurationTarget = user?.preferences?.sessionDurationSec || 45;

  // Refs for real-time 60fps loop without stale closures
  const runStateRef = useRef<RunState>('idle');
  const inputModeRef = useRef(inputMode);
  const showGazeIndicatorRef = useRef(user?.preferences?.showGazeIndicator ?? true);
  const targetRef = useRef<TargetState>(target);
  const lastUiIndicatorSyncRef = useRef(0);
  const autoPausedAtRef = useRef<number | null>(null);
  const validReturnStartRef = useRef<number | null>(null);

  const gazeContainerRef = useRef<ContainerGazeRefState>({
    containerX: 0,
    containerY: 0,
    clampedX: 360,
    clampedY: 220,
    valid: false,
    inBounds: false,
    gazeStatus: 'face-lost',
  });

  const statsRef = useRef({
    score: 0,
    hits: 0,
    misses: 0,
    reactionTimes: [] as number[],
    elapsedMs: 0,
    offScreenTimeMs: 0,
    invalidSampleCount: 0,
    continuousOffScreenMs: 0,
    // For follow-object checkpoint tracking
    followWindowElapsedMs: 0,
    followWindowOnTargetMs: 0,
    followPhaseSec: 0,
    followReacquireStart: null as number | null,
    lastTargetSpawnX: 0.5,
    lastTargetSpawnY: 0.5,
  });

  useEffect(() => {
    runStateRef.current = runState;
  }, [runState]);

  useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);

  useEffect(() => {
    showGazeIndicatorRef.current = user?.preferences?.showGazeIndicator ?? true;
  }, [user?.preferences?.showGazeIndicator]);

  // Fetch adaptive difficulty state from backend on mount
  const loadAdaptiveState = useCallback(async () => {
    try {
      const state = await trainingApi.getAdaptiveState();
      setDifficultyLevel(state.currentDifficultyLevel);
      setAdaptiveParams(state.adaptiveParams);
      setAdaptiveEnabled(state.adaptiveEnabled);
      setLastAdjustmentNote(state.lastAdjustmentNote);
    } catch {
      // Keep baseline defaults if request fails
    }
  }, []);

  useEffect(() => {
    void loadAdaptiveState();
  }, [loadAdaptiveState]);

  // Synchronous per-frame webcam gaze handler using container getBoundingClientRect()
  const handleWebcamFrame = useCallback((frame: GazeFrameEvent) => {
    if (inputModeRef.current !== 'webcam') return;
    const arena = arenaRef.current;
    if (!arena) return;

    const rect = arena.getBoundingClientRect();
    const projected = projectGazeToContainer(frame.mapped, rect);

    gazeContainerRef.current = {
      containerX: projected.containerX,
      containerY: projected.containerY,
      clampedX: projected.clampedContainerX,
      clampedY: projected.clampedContainerY,
      valid: projected.valid,
      inBounds: projected.inBounds,
      gazeStatus: projected.gazeStatus,
    };

    // Count invalid / out-of-bounds samples during active play
    if (runStateRef.current === 'running' && (!projected.valid || !projected.inBounds)) {
      statsRef.current.invalidSampleCount += 1;
    }

    // Auto-resume from auto-paused once valid in-bounds gaze returns continuously for ~500 ms
    if (runStateRef.current === 'auto-paused') {
      if (projected.valid && projected.inBounds) {
        if (validReturnStartRef.current === null) {
          validReturnStartRef.current = frame.timestamp;
        } else if (frame.timestamp - validReturnStartRef.current >= GAZE_CONFIG.GAME_RESUME_STABLE_MS) {
          const pausedDuration =
            autoPausedAtRef.current !== null ? frame.timestamp - autoPausedAtRef.current : 0;
          targetRef.current = {
            ...targetRef.current,
            spawnedAt: targetRef.current.spawnedAt + pausedDuration,
            firstFocusAt: null,
            dwellMs: 0,
          };
          setTarget(targetRef.current);
          statsRef.current.continuousOffScreenMs = 0;
          autoPausedAtRef.current = null;
          validReturnStartRef.current = null;
          runStateRef.current = 'running';
          setRunState('running');
        }
      } else {
        validReturnStartRef.current = null;
      }
    }

    // Throttle React visual indicator updates (~30Hz)
    if (frame.timestamp - lastUiIndicatorSyncRef.current >= 33) {
      lastUiIndicatorSyncRef.current = frame.timestamp;
      setLiveGazeStatus(projected.gazeStatus);
      setIndicatorPos({
        x: projected.clampedContainerX,
        y: projected.clampedContainerY,
        visible: showGazeIndicatorRef.current && projected.valid,
        offScreen: !projected.inBounds,
      });
    }
  }, []);

  const {
    videoRef,
    overlayCanvasRef,
    cameraStatus,
    errorMessage,
    faceDetected,
    frameQuality,
    startCamera,
    stopCamera,
  } = useGazeTracker({
    referenceValues: activeModeReference,
    eyeMode: activeEyeMode,
    preferredDeviceId: selectedCameraId || user?.preferences?.preferredCameraId,
    autoStart: false,
    onFrame: handleWebcamFrame,
  });

  // Mouse fallback pointer inside arena (px) — stays behind Dev Fallback toggle
  const handleArenaPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (inputMode !== 'mouse-fallback' || !arenaRef.current) return;
    const rect = arenaRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    const inBounds = xPx >= 0 && xPx <= rect.width && yPx >= 0 && yPx <= rect.height;
    const clampedX = Math.min(rect.width, Math.max(0, xPx));
    const clampedY = Math.min(rect.height, Math.max(0, yPx));

    gazeContainerRef.current = {
      containerX: xPx,
      containerY: yPx,
      clampedX,
      clampedY,
      valid: true,
      inBounds,
      gazeStatus: inBounds ? 'ok' : 'off-screen',
    };
    setLiveGazeStatus(inBounds ? 'ok' : 'off-screen');
    setIndicatorPos({
      x: clampedX,
      y: clampedY,
      visible: true,
      offScreen: !inBounds,
    });
  };

  const handleArenaPointerLeave = () => {
    if (inputMode !== 'mouse-fallback') return;
    gazeContainerRef.current = {
      ...gazeContainerRef.current,
      inBounds: false,
      gazeStatus: 'off-screen',
    };
    setLiveGazeStatus('off-screen');
    setIndicatorPos((prev) => ({ ...prev, offScreen: true }));
  };

  const spawnNextTarget = useCallback(
    (now: number, prevX: number, prevY: number): TargetState => {
      const spread = Math.min(0.82, Math.max(0.32, adaptiveParams.targetDistanceRatio));
      const minBound = 0.5 - spread / 2;
      const maxBound = 0.5 + spread / 2;

      let nx = 0.5;
      let ny = 0.5;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        nx = minBound + Math.random() * (maxBound - minBound);
        ny = minBound + Math.random() * (maxBound - minBound);
        const dist = Math.hypot(nx - prevX, ny - prevY);
        if (dist >= spread * 0.35) break;
      }

      const next: TargetState = {
        id: targetRef.current.id + 1,
        x: nx,
        y: ny,
        spawnedAt: now,
        firstFocusAt: null,
        dwellMs: 0,
      };
      targetRef.current = next;
      statsRef.current.lastTargetSpawnX = nx;
      statsRef.current.lastTargetSpawnY = ny;
      setTarget(next);
      return next;
    },
    [adaptiveParams.targetDistanceRatio]
  );

  const finalizeAndSaveSession = useCallback(async () => {
    if (runStateRef.current === 'finished') return;
    runStateRef.current = 'finished';
    setRunState('finished');
    setIsGazeOnTarget(false);

    const s = statsRef.current;
    const totalTargets = s.hits + s.misses;
    const avgRt =
      s.reactionTimes.length > 0
        ? Math.round(s.reactionTimes.reduce((a, b) => a + b, 0) / s.reactionTimes.length)
        : 0;
    // Active unpaused training duration only (manual & auto-paused time excluded)
    const durationSec = Math.max(1, Math.round(s.elapsedMs / 1000));
    const offScreenSec = Number((s.offScreenTimeMs / 1000).toFixed(1));

    setScore(s.score);
    setTargetsHit(s.hits);
    setTargetsMissed(s.misses);
    setAvgReactionMs(avgRt);

    setSavingSession(true);
    setSaveError(null);

    try {
      const result = await trainingApi.createSession({
        gameType: selectedGame,
        difficultyLevel,
        difficultyParams: adaptiveParams,
        eyeMode: activeEyeMode,
        inputMode,
        totalTargets,
        targetsHit: s.hits,
        targetsMissed: s.misses,
        averageReactionTime: avgRt,
        score: s.score,
        sessionDuration: durationSec,
        offScreenTime: offScreenSec,
        invalidSampleCount: s.invalidSampleCount,
      });

      setCompletedSummary({
        session: result.session,
        adjustment: result.difficultyAdjustment,
      });
      setDifficultyLevel(result.progress.currentDifficultyLevel);
      setAdaptiveParams(result.progress.adaptiveParams);
      setLastAdjustmentNote(result.progress.lastAdjustmentNote);
    } catch (err) {
      setSaveError(extractApiError(err, 'Session completed, but could not save to server.'));
    } finally {
      setSavingSession(false);
    }
  }, [activeEyeMode, adaptiveParams, difficultyLevel, inputMode, selectedGame]);

  const startSession = useCallback(async () => {
    setCompletedSummary(null);
    setSaveError(null);
    setFeedbackBanner(null);

    if (inputMode === 'webcam' && !activeModeReference) {
      setFeedbackBanner(
        `Calibration is required for ${
          activeEyeMode === 'both' ? 'Both Eyes' : `${activeEyeMode} Eye`
        } mode before starting webcam training. Calibrate this mode or switch to Dev Fallback: Mouse.`
      );
      return;
    }

    if (inputMode === 'webcam' && cameraStatus !== 'ready') {
      const ok = await startCamera();
      if (!ok) {
        setFeedbackBanner(
          'Webcam could not start. You can enable the Development Fallback: Mouse Pointer mode below to test exercises immediately.'
        );
        return;
      }
    }

    const now = performance.now();
    autoPausedAtRef.current = null;
    validReturnStartRef.current = null;

    statsRef.current = {
      score: 0,
      hits: 0,
      misses: 0,
      reactionTimes: [],
      elapsedMs: 0,
      offScreenTimeMs: 0,
      invalidSampleCount: 0,
      continuousOffScreenMs: 0,
      followWindowElapsedMs: 0,
      followWindowOnTargetMs: 0,
      followPhaseSec: 0,
      followReacquireStart: now,
      lastTargetSpawnX: 0.5,
      lastTargetSpawnY: 0.5,
    };

    setScore(0);
    setTargetsHit(0);
    setTargetsMissed(0);
    setAvgReactionMs(0);
    setElapsedSec(0);

    if (selectedGame === 'follow-object') {
      const initTarget: TargetState = {
        id: 1,
        x: 0.5,
        y: 0.5,
        spawnedAt: now,
        firstFocusAt: null,
        dwellMs: 0,
      };
      targetRef.current = initTarget;
      setTarget(initTarget);
    } else {
      spawnNextTarget(now, 0.5, 0.5);
    }

    runStateRef.current = 'running';
    setRunState('running');
  }, [
    activeEyeMode,
    activeModeReference,
    cameraStatus,
    inputMode,
    selectedGame,
    spawnNextTarget,
    startCamera,
  ]);

  const pauseSession = () => {
    if (runState === 'running') {
      autoPausedAtRef.current = performance.now();
      runStateRef.current = 'paused';
      setRunState('paused');
    }
  };

  const resumeSession = () => {
    if (runState === 'paused' || runState === 'auto-paused') {
      const pausedDuration =
        autoPausedAtRef.current !== null ? performance.now() - autoPausedAtRef.current : 0;
      targetRef.current = {
        ...targetRef.current,
        spawnedAt: targetRef.current.spawnedAt + pausedDuration,
        firstFocusAt: null,
        dwellMs: 0,
      };
      setTarget(targetRef.current);
      statsRef.current.continuousOffScreenMs = 0;
      autoPausedAtRef.current = null;
      validReturnStartRef.current = null;
      runStateRef.current = 'running';
      setRunState('running');
    }
  };

  // Main real-time exercise simulation loop (60fps) — ONLY runs while runState === 'running'
  // (manual 'paused' and 'auto-paused' time are completely excluded from sessionDuration)
  useEffect(() => {
    if (runState !== 'running') return;

    let rafId = 0;
    let prevTs = performance.now();

    const tick = (now: number) => {
      if (runStateRef.current !== 'running') return;

      const dtMs = Math.min(80, Math.max(0, now - prevTs));
      prevTs = now;

      const s = statsRef.current;
      const arena = arenaRef.current;
      const rect = arena?.getBoundingClientRect();
      const arenaW = rect?.width || 720;
      const arenaH = rect?.height || 440;

      const gaze = gazeContainerRef.current;
      const gazeValidAndInBounds = gaze.valid && gaze.inBounds;

      // Track off-screen / invalid gaze duration & auto-pause after ~1.5s in webcam mode
      if (!gazeValidAndInBounds) {
        s.offScreenTimeMs += dtMs;
        s.continuousOffScreenMs += dtMs;

        // Immediately reset dwell progress so out-of-bounds/invalid samples never carry dwell
        if (targetRef.current.dwellMs > 0 || targetRef.current.firstFocusAt !== null) {
          const resetTarget: TargetState = {
            ...targetRef.current,
            dwellMs: 0,
            firstFocusAt: null,
          };
          targetRef.current = resetTarget;
          setTarget(resetTarget);
        }
        setIsGazeOnTarget(false);

        if (
          inputMode === 'webcam' &&
          s.continuousOffScreenMs >= GAZE_CONFIG.GAME_OFFSCREEN_PAUSE_MS
        ) {
          autoPausedAtRef.current = now;
          validReturnStartRef.current = null;
          runStateRef.current = 'auto-paused';
          setRunState('auto-paused');
          return;
        }
      } else {
        s.continuousOffScreenMs = 0;
      }

      // Advance active unpaused session time
      s.elapsedMs += dtMs;
      const currentSec = Math.floor(s.elapsedMs / 1000);
      setElapsedSec((prev) => (prev !== currentSec ? currentSec : prev));

      if (s.elapsedMs >= sessionDurationTarget * 1000) {
        void finalizeAndSaveSession();
        return;
      }

      // Hit detection uses strictly UNCLAMPED container coordinates (containerX, containerY)
      const gazePxX = gaze.containerX;
      const gazePxY = gaze.containerY;
      const curTarget = targetRef.current;

      const detectionRadius =
        inputMode === 'webcam'
          ? adaptiveParams.targetSizePx * 0.9
          : adaptiveParams.targetSizePx * 0.65;

      if (selectedGame === 'follow-object') {
        s.followPhaseSec += (dtMs / 1000) * adaptiveParams.targetSpeed;
        const ampX = Math.min(0.4, adaptiveParams.targetDistanceRatio * 0.48);
        const ampY = Math.min(0.36, adaptiveParams.targetDistanceRatio * 0.44);
        const nextX = 0.5 + ampX * Math.sin(s.followPhaseSec * 0.95);
        const nextY = 0.5 + ampY * Math.sin(s.followPhaseSec * 1.45);

        const dist = Math.hypot(gazePxX - nextX * arenaW, gazePxY - nextY * arenaH);
        const onTarget = gazeValidAndInBounds && dist <= detectionRadius;
        setIsGazeOnTarget(onTarget);

        if (onTarget) {
          if (s.followReacquireStart !== null) {
            const rt = Math.round(now - s.followReacquireStart);
            if (rt > 80 && rt < 6000) s.reactionTimes.push(rt);
            s.followReacquireStart = null;
          }
          s.followWindowOnTargetMs += dtMs;
        } else if (s.followReacquireStart === null) {
          s.followReacquireStart = now;
        }

        s.followWindowElapsedMs += dtMs;
        if (s.followWindowElapsedMs >= 2000) {
          const ratio = s.followWindowOnTargetMs / s.followWindowElapsedMs;
          if (ratio >= 0.42) {
            s.hits += 1;
            s.score += Math.round(80 + ratio * 70);
          } else {
            s.misses += 1;
          }
          s.followWindowElapsedMs = 0;
          s.followWindowOnTargetMs = 0;

          setTargetsHit(s.hits);
          setTargetsMissed(s.misses);
          setScore(s.score);
          if (s.reactionTimes.length > 0) {
            setAvgReactionMs(
              Math.round(s.reactionTimes.reduce((a, b) => a + b, 0) / s.reactionTimes.length)
            );
          }
        }

        const updatedTarget: TargetState = {
          ...curTarget,
          x: nextX,
          y: nextY,
          dwellMs: onTarget ? Math.min(1000, curTarget.dwellMs + dtMs) : 0,
        };
        targetRef.current = updatedTarget;
        setTarget(updatedTarget);
      } else {
        // Catch the Targets OR Focus and Hold
        const targetPxX = curTarget.x * arenaW;
        const targetPxY = curTarget.y * arenaH;
        const dist = Math.hypot(gazePxX - targetPxX, gazePxY - targetPxY);
        const onTarget = gazeValidAndInBounds && dist <= detectionRadius;
        setIsGazeOnTarget(onTarget);

        const requiredDwellMs =
          selectedGame === 'focus-hold' ? adaptiveParams.holdDurationMs : 240;
        const allowedTimeMs =
          selectedGame === 'focus-hold'
            ? adaptiveParams.responseTimeMs + adaptiveParams.holdDurationMs
            : adaptiveParams.responseTimeMs;

        let nextDwell = curTarget.dwellMs;
        let firstFocusAt = curTarget.firstFocusAt;

        if (!gazeValidAndInBounds) {
          // Out-of-bounds or invalid gaze strictly resets dwell progress to zero
          nextDwell = 0;
          firstFocusAt = null;
        } else if (onTarget) {
          if (firstFocusAt === null) {
            firstFocusAt = now;
          }
          nextDwell = curTarget.dwellMs + dtMs;
        } else {
          // On-screen but off-target: gentle decay
          nextDwell = Math.max(0, curTarget.dwellMs - dtMs * 0.55);
        }

        if (gazeValidAndInBounds && nextDwell >= requiredDwellMs) {
          // Valid Target Hit!
          const reactionTime = Math.max(
            90,
            Math.round((firstFocusAt ?? now) - curTarget.spawnedAt)
          );
          s.hits += 1;
          s.reactionTimes.push(reactionTime);
          const speedBonus = Math.max(0, Math.round((allowedTimeMs - reactionTime) / 40));
          s.score += 100 + speedBonus;

          setTargetsHit(s.hits);
          setScore(s.score);
          setAvgReactionMs(
            Math.round(s.reactionTimes.reduce((a, b) => a + b, 0) / s.reactionTimes.length)
          );

          if (s.hits + s.misses >= adaptiveParams.targetCount) {
            void finalizeAndSaveSession();
            return;
          }
          spawnNextTarget(now, curTarget.x, curTarget.y);
        } else if (now - curTarget.spawnedAt >= allowedTimeMs) {
          // Target Missed
          s.misses += 1;
          setTargetsMissed(s.misses);

          if (s.hits + s.misses >= adaptiveParams.targetCount) {
            void finalizeAndSaveSession();
            return;
          }
          spawnNextTarget(now, curTarget.x, curTarget.y);
        } else {
          const updated: TargetState = {
            ...curTarget,
            firstFocusAt,
            dwellMs: nextDwell,
          };
          targetRef.current = updated;
          setTarget(updated);
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    adaptiveParams,
    finalizeAndSaveSession,
    inputMode,
    runState,
    selectedGame,
    sessionDurationTarget,
    spawnNextTarget,
  ]);

  const isSessionActive =
    runState === 'running' || runState === 'paused' || runState === 'auto-paused';

  const handleSelectGame = (game: GameType) => {
    if (isSessionActive) return;
    setSelectedGame(game);
    setSearchParams({ game });
    setCompletedSummary(null);
  };

  const handleManualLevel = async (level: DifficultyLevel) => {
    if (isSessionActive) return;
    try {
      const res = await trainingApi.setDifficultyLevel(level);
      setDifficultyLevel(res.progress.currentDifficultyLevel);
      setAdaptiveParams(res.progress.adaptiveParams);
      setLastAdjustmentNote(res.progress.lastAdjustmentNote);
    } catch {
      // Ignore transient error
    }
  };

  const totalAttempts = targetsHit + targetsMissed;
  const liveAccuracy = totalAttempts > 0 ? (targetsHit / totalAttempts) * 100 : 0;
  const remainingSec = Math.max(0, sessionDurationTarget - elapsedSec);
  const statusDisplay = getGazeStatusDisplay(
    inputMode === 'webcam' && cameraStatus !== 'ready' ? 'face-lost' : liveGazeStatus
  );

  const activeGameMeta = GAMES.find((g) => g.id === selectedGame)!;
  const requiredDwellMs = selectedGame === 'focus-hold' ? adaptiveParams.holdDurationMs : 240;
  const holdProgress = Math.min(1, target.dwellMs / Math.max(1, requiredDwellMs));
  const ringRadius = adaptiveParams.targetSizePx / 2 + 6;
  const ringCircumference = 2 * Math.PI * ringRadius;

  return (
    <div className="space-y-6">
      {/* Top Configuration Strip: Game Selector, Eye Mode, Input Mode */}
      <section className="rounded-2xl border border-[#E6E3FA] bg-white p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#F7F6FF] border border-[#E6E3FA]">
            {GAMES.map((game) => (
              <button
                key={game.id}
                type="button"
                disabled={isSessionActive}
                onClick={() => handleSelectGame(game.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                  selectedGame === game.id
                    ? 'bg-white text-[#6554E8] shadow-xs'
                    : 'text-[#5C597E] hover:text-[#25234A]'
                }`}
              >
                {game.title}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Eye Mode Selector */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F7F6FF] border border-[#E6E3FA]">
              {(['both', 'left', 'right'] as EyeMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={isSessionActive}
                  onClick={() => {
                    setActiveEyeMode(mode);
                    setFeedbackBanner(null);
                    const nextAffected = mode === 'both' ? affectedEye : mode;
                    const nextPractice = mode === 'both' ? 'both-eyes' : 'affected-eye-only';
                    void updateCalibrationMode(nextAffected, nextPractice).catch(() => {});
                  }}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap disabled:opacity-60 ${
                    activeEyeMode === mode
                      ? 'bg-white text-[#25234A] font-semibold shadow-xs'
                      : 'text-[#5C597E] hover:text-[#25234A]'
                  }`}
                >
                  {mode === 'both' ? 'Both Eyes' : `${mode} Eye`}
                </button>
              ))}
            </div>

            {/* Input Mode Switch (Real Webcam Primary + Clearly Labelled Mouse Fallback) */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F7F6FF] border border-[#E6E3FA]">
              <button
                type="button"
                disabled={isSessionActive}
                onClick={() => setInputMode('webcam')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  inputMode === 'webcam'
                    ? 'bg-white text-[#6554E8] font-semibold shadow-xs'
                    : 'text-[#5C597E] hover:text-[#25234A]'
                }`}
              >
                <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                Webcam Gaze
              </button>
              <button
                type="button"
                disabled={isSessionActive}
                onClick={() => {
                  stopCamera();
                  setInputMode('mouse-fallback');
                  setLiveGazeStatus('ok');
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  inputMode === 'mouse-fallback'
                    ? 'bg-white text-[#A87518] font-semibold shadow-xs'
                    : 'text-[#5C597E] hover:text-[#25234A]'
                }`}
              >
                <MousePointer2 className="w-3.5 h-3.5" aria-hidden="true" />
                Dev Fallback: Mouse
              </button>
            </div>
          </div>
        </div>

        {/* Difficulty & Adaptive Status Row */}
        <div className="pt-3 border-t border-[#E6E3FA] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#5C597E]">
            <span>
              Exercise: <strong className="text-[#25234A]">{activeGameMeta.subtitle}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Adaptive Level:{' '}
              <strong className="text-[#6554E8] capitalize">{difficultyLevel}</strong>
              {adaptiveEnabled ? ' (Auto)' : ' (Manual)'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Size {adaptiveParams.targetSizePx}px · Speed {adaptiveParams.targetSpeed}x · Window{' '}
              {(adaptiveParams.responseTimeMs / 1000).toFixed(1)}s
            </span>
          </div>

          <div className="flex items-center gap-1">
            {(['beginner', 'intermediate', 'advanced'] as DifficultyLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                disabled={isSessionActive}
                onClick={() => void handleManualLevel(lvl)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors disabled:opacity-50 ${
                  difficultyLevel === lvl
                    ? 'bg-[#F0EDFF] text-[#6554E8] font-semibold'
                    : 'text-[#5C597E] hover:bg-[#F7F6FF]'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {activeEyeMode !== 'both' && (
          <div className="rounded-xl border border-[#E6E3FA] bg-[#F7F6FF] px-4 py-3 text-xs text-[#5C597E] space-y-1">
            <p>
              <strong className="text-[#25234A]">
                Single-Eye Tracking Active ({activeEyeMode === 'left' ? 'Left' : 'Right'} Eye):
              </strong>{' '}
              Use an eye patch or cover the other eye. Closing it by squeezing can distort tracking.
            </p>
            <p>
              All gaze validity checks depend only on your {activeEyeMode} eye—your{' '}
              {activeEyeMode === 'left' ? 'right' : 'left'} eye&apos;s landmarks are ignored.
              AmblyoCare does not occlude the other eye.
            </p>
          </div>
        )}

        {modeRequiresCalibration && (
          <div className="rounded-xl border border-[#F2B84B]/45 bg-[#FFF9EB] px-4 py-3 text-xs text-[#7D550E] flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong>
                Calibration required for{' '}
                {activeEyeMode === 'both'
                  ? 'Both Eyes'
                  : activeEyeMode === 'left'
                    ? 'Left Eye Only'
                    : 'Right Eye Only'}{' '}
                mode:
              </strong>{' '}
              Complete 9-point calibration and 5-point validation for this mode (saved mode:{' '}
              {practiceMode === 'affected-eye-only' ? 'Affected eye only' : 'Both eyes'}) so games
              use the matching gaze mapping.
            </span>
            <Link
              to="/calibration"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#6554E8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#5342D6] whitespace-nowrap"
            >
              <Crosshair className="w-3.5 h-3.5" />
              Calibrate This Mode
            </Link>
          </div>
        )}

        {inputMode === 'mouse-fallback' && (
          <div className="rounded-xl border border-[#F2B84B]/40 bg-[#FFF9EB] px-4 py-2.5 text-xs text-[#7D550E]">
            <strong>Development Fallback Active (Mouse Pointer):</strong> Move your mouse pointer
            over targets to test gameplay, performance scoring, and adaptive difficulty when webcam
            gaze tracking is unavailable. Sessions are labelled as mouse-fallback in your history.
          </div>
        )}

        {feedbackBanner && (
          <div className="rounded-xl border border-[#E76B75]/40 bg-[#FFF5F6] px-4 py-2.5 text-xs text-[#A3303B] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{feedbackBanner}</span>
          </div>
        )}
      </section>

      {/* Real-Time Performance HUD */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-[#E6E3FA] bg-white px-4 py-3">
          <span className="text-[11px] font-medium text-[#5C597E] block">Score</span>
          <span className="font-display text-lg font-bold tabular-nums text-[#6554E8]">
            {score}
          </span>
        </div>
        <div className="rounded-xl border border-[#E6E3FA] bg-white px-4 py-3">
          <span className="text-[11px] font-medium text-[#5C597E] block">Accuracy</span>
          <span className="font-display text-lg font-bold tabular-nums text-[#25234A]">
            {totalAttempts > 0 ? `${liveAccuracy.toFixed(1)}%` : '—'}
          </span>
        </div>
        <div className="rounded-xl border border-[#E6E3FA] bg-white px-4 py-3">
          <span className="text-[11px] font-medium text-[#5C597E] block">Reaction Time</span>
          <span className="font-display text-lg font-bold tabular-nums text-[#25234A]">
            {avgReactionMs > 0 ? `${avgReactionMs} ms` : '—'}
          </span>
        </div>
        <div className="rounded-xl border border-[#E6E3FA] bg-white px-4 py-3">
          <span className="text-[11px] font-medium text-[#5C597E] block">Targets Hit</span>
          <span className="font-display text-lg font-bold tabular-nums text-[#238858]">
            {targetsHit}
          </span>
        </div>
        <div className="rounded-xl border border-[#E6E3FA] bg-white px-4 py-3">
          <span className="text-[11px] font-medium text-[#5C597E] block">Targets Missed</span>
          <span className="font-display text-lg font-bold tabular-nums text-[#C24550]">
            {targetsMissed}
          </span>
        </div>
        <div className="rounded-xl border border-[#E6E3FA] bg-white px-4 py-3">
          <span className="text-[11px] font-medium text-[#5C597E] block">
            {isSessionActive ? 'Active Time Left' : 'Duration'}
          </span>
          <span className="font-display text-lg font-bold tabular-nums text-[#25234A]">
            {runState === 'idle' ? `${sessionDurationTarget}s` : `${remainingSec}s`}
          </span>
        </div>
      </section>

      {/* Main Training Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Interactive Training Arena */}
        <div className="lg:col-span-9 rounded-2xl border border-[#E6E3FA] bg-white overflow-hidden">
          {/* Controls & Live Gaze Status Toolbar */}
          <div className="px-5 py-3.5 border-b border-[#E6E3FA] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <span className={`w-2 h-2 rounded-full ${statusDisplay.dotClass}`} aria-hidden="true" />
                <span className={statusDisplay.colorClass}>{statusDisplay.label}</span>
              </span>
              <span aria-hidden="true" className="text-[#5C597E]">
                ·
              </span>
              <p className="text-[#5C597E] max-w-md">{activeGameMeta.instruction}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {runState === 'idle' || runState === 'finished' ? (
                <button
                  type="button"
                  onClick={() => void startSession()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#6554E8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5342D6] whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  {runState === 'finished' ? 'Play Again' : 'Start'}
                </button>
              ) : runState === 'running' ? (
                <>
                  <button
                    type="button"
                    onClick={pauseSession}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E6E3FA] bg-white px-3.5 py-2 text-xs font-semibold text-[#25234A] hover:bg-[#F7F6FF] whitespace-nowrap"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </button>
                  <button
                    type="button"
                    onClick={() => void startSession()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E6E3FA] bg-white px-3.5 py-2 text-xs font-semibold text-[#5C597E] hover:bg-[#F7F6FF] whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restart
                  </button>
                  <button
                    type="button"
                    onClick={() => void finalizeAndSaveSession()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#E76B75] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#D35560] whitespace-nowrap"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    End Session
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={resumeSession}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#6554E8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5342D6] whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Resume
                  </button>
                  <button
                    type="button"
                    onClick={() => void startSession()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E6E3FA] px-3.5 py-2 text-xs font-semibold text-[#5C597E] hover:bg-[#F7F6FF] whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restart
                  </button>
                  <button
                    type="button"
                    onClick={() => void finalizeAndSaveSession()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#E76B75] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#D35560] whitespace-nowrap"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    End Session
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Interactive Exercise Canvas */}
          <div
            ref={arenaRef}
            onPointerMove={handleArenaPointerMove}
            onPointerLeave={handleArenaPointerLeave}
            className="relative h-[440px] sm:h-[490px] w-full bg-[#F7F6FF] overflow-hidden select-none"
          >
            {/* Subtle calibration grid lines */}
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none opacity-45"
              style={{
                backgroundImage:
                  'linear-gradient(to right, #E6E3FA 1px, transparent 1px), linear-gradient(to bottom, #E6E3FA 1px, transparent 1px)',
                backgroundSize: '80px 80px',
              }}
            />

            {/* Active Target */}
            {isSessionActive && (
              <div
                style={{
                  left: `${target.x * 100}%`,
                  top: `${target.y * 100}%`,
                  width: `${adaptiveParams.targetSizePx}px`,
                  height: `${adaptiveParams.targetSizePx}px`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
              >
                {/* Dwell / Hold SVG Progress Ring */}
                <svg
                  width={adaptiveParams.targetSizePx + 20}
                  height={adaptiveParams.targetSizePx + 20}
                  className="absolute -rotate-90 pointer-events-none"
                >
                  <circle
                    cx={(adaptiveParams.targetSizePx + 20) / 2}
                    cy={(adaptiveParams.targetSizePx + 20) / 2}
                    r={ringRadius}
                    fill="none"
                    stroke="#E6E3FA"
                    strokeWidth="4"
                  />
                  <circle
                    cx={(adaptiveParams.targetSizePx + 20) / 2}
                    cy={(adaptiveParams.targetSizePx + 20) / 2}
                    r={ringRadius}
                    fill="none"
                    stroke={isGazeOnTarget ? '#35B779' : '#6554E8'}
                    strokeWidth="4"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringCircumference * (1 - holdProgress)}
                    strokeLinecap="round"
                  />
                </svg>

                {/* Target Disc */}
                <div
                  className={`w-full h-full rounded-full border-4 flex items-center justify-center transition-colors duration-100 ${
                    isGazeOnTarget
                      ? 'bg-[#35B779] border-white shadow-md'
                      : 'bg-[#6554E8] border-white shadow-sm'
                  }`}
                >
                  <div className="w-3.5 h-3.5 rounded-full bg-white" />
                </div>
              </div>
            )}

            {/* Visually Edge-Clamped Gaze Reticle (display only — hit detection strictly uses unclamped coords) */}
            <GazeIndicator
              x={indicatorPos.x}
              y={indicatorPos.y}
              visible={indicatorPos.visible && runState === 'running'}
              locked={isGazeOnTarget}
              offScreen={indicatorPos.offScreen}
            />

            {/* Idle Overlay */}
            {runState === 'idle' && (
              <div className="absolute inset-0 bg-[#F7F6FF]/85 flex flex-col items-center justify-center p-6 text-center">
                <h3 className="font-display text-xl font-bold text-[#25234A]">
                  {activeGameMeta.title}
                </h3>
                <p className="mt-2 text-sm text-[#5C597E] max-w-md leading-relaxed">
                  {activeGameMeta.instruction}
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => void startSession()}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-6 py-3 text-sm font-semibold text-white hover:bg-[#5342D6]"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Start Exercise
                  </button>
                  {!activeModeReference && inputMode === 'webcam' && (
                    <Link
                      to="/calibration"
                      className="inline-flex items-center gap-2 rounded-lg border border-[#E6E3FA] bg-white px-4 py-3 text-sm font-medium text-[#25234A] hover:bg-[#F0EDFF]/60"
                    >
                      <Crosshair className="w-4 h-4 text-[#6554E8]" />
                      Calibrate First
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Auto-Paused Overlay (Lost Gaze / Off-Screen > 1.5s) */}
            {runState === 'auto-paused' && (
              <div
                role="alert"
                className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center p-6 text-center z-40"
              >
                <div className="w-11 h-11 rounded-full bg-[#FFF9EB] border border-[#F2B84B]/50 flex items-center justify-center mb-3">
                  <EyeOff className="w-5 h-5 text-[#D98E16]" aria-hidden="true" />
                </div>
                <h3 className="font-display text-lg font-bold text-[#25234A]">
                  {activeEyeMode === 'both'
                    ? 'We lost your gaze. Look at the screen and keep your face in view'
                    : `We can't detect your gaze. Keep your ${activeEyeMode} eye open and visible.`}
                </h3>
                <p className="mt-1.5 text-sm text-[#5C597E] max-w-md">
                  {activeEyeMode === 'both'
                    ? "Game paused automatically so off-screen time isn't counted in your training duration. It will resume automatically once valid on-screen gaze returns."
                    : `Game paused automatically while your ${activeEyeMode} eye gaze was unavailable. Look back at the screen with your ${activeEyeMode} eye open and visible to resume automatically.`}
                </p>
                <p className="mt-2 text-xs font-medium text-[#5C597E]">
                  Current status:{' '}
                  <strong className={statusDisplay.colorClass}>{statusDisplay.label}</strong>
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void finalizeAndSaveSession()}
                    className="rounded-lg border border-[#E6E3FA] bg-white px-4 py-2 text-xs font-semibold text-[#25234A] hover:bg-[#F7F6FF]"
                  >
                    End & Save Session
                  </button>
                </div>
              </div>
            )}

            {/* Manual Paused Overlay */}
            {runState === 'paused' && (
              <div className="absolute inset-0 bg-white/85 flex flex-col items-center justify-center p-6 text-center z-40">
                <h3 className="font-display text-xl font-bold text-[#25234A]">Session Paused</h3>
                <p className="mt-1.5 text-sm text-[#5C597E]">
                  Rest your eyes for a moment. Paused time is excluded from your session duration.
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={resumeSession}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#5342D6]"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Resume Session
                  </button>
                  <button
                    type="button"
                    onClick={() => void finalizeAndSaveSession()}
                    className="rounded-lg border border-[#E6E3FA] bg-white px-4 py-2.5 text-sm font-medium text-[#25234A] hover:bg-[#F7F6FF]"
                  >
                    End & Save
                  </button>
                </div>
              </div>
            )}

            {/* Completed Summary Overlay */}
            {runState === 'finished' && (
              <div className="absolute inset-0 bg-white/96 flex items-center justify-center p-5 overflow-y-auto z-40">
                <div className="w-full max-w-lg rounded-2xl border border-[#E6E3FA] bg-white p-6">
                  {savingSession ? (
                    <div className="py-10 text-center">
                      <div className="w-8 h-8 border-2 border-[#6554E8] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-sm font-semibold text-[#25234A]">
                        Calculating metrics & updating adaptive difficulty...
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-5 h-5 text-[#35B779] shrink-0" />
                        <h3 className="font-display text-lg font-bold text-[#25234A]">
                          Session Complete & Saved
                        </h3>
                      </div>

                      {saveError && (
                        <p className="mt-2 text-xs text-[#C24550]">{saveError}</p>
                      )}

                      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                        <div className="rounded-xl bg-[#F7F6FF] p-3">
                          <span className="text-[11px] text-[#5C597E] block">Accuracy</span>
                          <strong className="font-display text-lg font-bold tabular-nums text-[#25234A]">
                            {completedSummary
                              ? `${completedSummary.session.accuracy.toFixed(1)}%`
                              : `${liveAccuracy.toFixed(1)}%`}
                          </strong>
                        </div>
                        <div className="rounded-xl bg-[#F7F6FF] p-3">
                          <span className="text-[11px] text-[#5C597E] block">Reaction Time</span>
                          <strong className="font-display text-lg font-bold tabular-nums text-[#25234A]">
                            {avgReactionMs > 0 ? `${avgReactionMs} ms` : '—'}
                          </strong>
                        </div>
                        <div className="rounded-xl bg-[#F7F6FF] p-3">
                          <span className="text-[11px] text-[#5C597E] block">Hits / Total</span>
                          <strong className="font-display text-lg font-bold tabular-nums text-[#238858]">
                            {targetsHit}/{totalAttempts}
                          </strong>
                        </div>
                        <div className="rounded-xl bg-[#F7F6FF] p-3">
                          <span className="text-[11px] text-[#5C597E] block">Score</span>
                          <strong className="font-display text-lg font-bold tabular-nums text-[#6554E8]">
                            {score}
                          </strong>
                        </div>
                      </div>

                      {completedSummary && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#5C597E] font-mono tabular-nums px-1">
                          <span>Active duration: {completedSummary.session.sessionDuration}s</span>
                          <span>
                            Off-screen time: {completedSummary.session.offScreenTime ?? 0}s
                          </span>
                          <span>
                            Invalid samples: {completedSummary.session.invalidSampleCount ?? 0}
                          </span>
                        </div>
                      )}

                      {completedSummary && (
                        <div className="mt-4 rounded-xl border border-[#E6E3FA] bg-[#F7F6FF]/70 p-4">
                          <div className="flex items-center gap-2 text-xs font-semibold text-[#25234A]">
                            {completedSummary.adjustment.direction === 'increased' ? (
                              <TrendingUp className="w-4 h-4 text-[#35B779]" />
                            ) : completedSummary.adjustment.direction === 'decreased' ? (
                              <TrendingDown className="w-4 h-4 text-[#F2B84B]" />
                            ) : (
                              <Minus className="w-4 h-4 text-[#6554E8]" />
                            )}
                            <span>
                              Adaptive Difficulty:{' '}
                              <span className="capitalize">
                                {completedSummary.adjustment.direction}
                              </span>{' '}
                              ({completedSummary.adjustment.newLevel})
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs text-[#5C597E] leading-relaxed">
                            {completedSummary.adjustment.reason}
                          </p>
                          <p className="mt-2 text-[11px] text-[#5C597E]">
                            Software-based training adjustment only — not a clinical treatment
                            recommendation.
                          </p>
                        </div>
                      )}

                      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
                        <Link
                          to="/analytics"
                          className="rounded-lg border border-[#E6E3FA] px-4 py-2 text-xs font-semibold text-[#25234A] hover:bg-[#F7F6FF]"
                        >
                          View Analytics
                        </Link>
                        <button
                          type="button"
                          onClick={() => void startSession()}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#6554E8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5342D6]"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Start Next Session
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Side Column: Compact Webcam Preview + Adaptive Parameters */}
        <div className="lg:col-span-3 space-y-4">
          {inputMode === 'webcam' ? (
            <WebcamPreview
              videoRef={videoRef}
              overlayCanvasRef={overlayCanvasRef}
              cameraStatus={cameraStatus}
              faceDetected={faceDetected}
              frameQuality={frameQuality}
              errorMessage={errorMessage}
              compact
              onStartCamera={() => void startCamera()}
            />
          ) : (
            <div className="rounded-xl border border-[#E6E3FA] bg-white p-4 text-xs text-[#5C597E]">
              <p className="font-semibold text-[#25234A]">Mouse Pointer Fallback</p>
              <p className="mt-1 leading-relaxed">
                Move your pointer over targets inside the arena. Switch back to Webcam Gaze above at
                any time.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-[#E6E3FA] bg-white p-4 space-y-3">
            <h3 className="font-display text-xs font-bold text-[#25234A]">
              Adaptive Difficulty Parameters
            </h3>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-[#5C597E]">Target Size</dt>
                <dd className="font-mono tabular-nums font-semibold text-[#25234A]">
                  {adaptiveParams.targetSizePx} px
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#5C597E]">Target Speed</dt>
                <dd className="font-mono tabular-nums font-semibold text-[#25234A]">
                  {adaptiveParams.targetSpeed}x
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#5C597E]">Spread Ratio</dt>
                <dd className="font-mono tabular-nums font-semibold text-[#25234A]">
                  {Math.round(adaptiveParams.targetDistanceRatio * 100)}%
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#5C597E]">Targets / Set</dt>
                <dd className="font-mono tabular-nums font-semibold text-[#25234A]">
                  {adaptiveParams.targetCount}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#5C597E]">Response Limit</dt>
                <dd className="font-mono tabular-nums font-semibold text-[#25234A]">
                  {(adaptiveParams.responseTimeMs / 1000).toFixed(1)} s
                </dd>
              </div>
            </dl>
            {lastAdjustmentNote && (
              <p className="pt-2.5 border-t border-[#E6E3FA] text-[11px] text-[#5C597E] leading-relaxed">
                {lastAdjustmentNote}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
