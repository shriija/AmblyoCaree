import type { DifficultyLevel } from '../models/User.ts';
import type { IDifficultyAdjustment, IDifficultyParams } from '../models/TrainingSession.ts';

export const DIFFICULTY_LIMITS = {
  targetSizePx: { min: 44, max: 96 },
  targetSpeed: { min: 0.7, max: 2.4 },
  targetDistanceRatio: { min: 0.35, max: 0.85 },
  targetCount: { min: 8, max: 22 },
  responseTimeMs: { min: 1900, max: 5200 },
  holdDurationMs: { min: 1000, max: 2800 },
};

export const LEVEL_PRESETS: Record<DifficultyLevel, IDifficultyParams> = {
  beginner: {
    targetSizePx: 84,
    targetSpeed: 1.0,
    targetDistanceRatio: 0.48,
    targetCount: 10,
    responseTimeMs: 4200,
    holdDurationMs: 1400,
  },
  intermediate: {
    targetSizePx: 66,
    targetSpeed: 1.45,
    targetDistanceRatio: 0.65,
    targetCount: 14,
    responseTimeMs: 3200,
    holdDurationMs: 1900,
  },
  advanced: {
    targetSizePx: 50,
    targetSpeed: 1.95,
    targetDistanceRatio: 0.8,
    targetCount: 18,
    responseTimeMs: 2400,
    holdDurationMs: 2400,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getPresetForLevel(level: DifficultyLevel): IDifficultyParams {
  return { ...LEVEL_PRESETS[level] };
}

export function evaluateAdaptiveDifficulty(params: {
  currentLevel: DifficultyLevel;
  currentParams: IDifficultyParams;
  accuracy: number;
  averageReactionTime: number;
  totalTargets: number;
  adaptiveEnabled: boolean;
}): {
  newLevel: DifficultyLevel;
  newParams: IDifficultyParams;
  adjustment: IDifficultyAdjustment;
} {
  const { currentLevel, currentParams, accuracy, averageReactionTime, totalTargets, adaptiveEnabled } = params;

  if (!adaptiveEnabled) {
    return {
      newLevel: currentLevel,
      newParams: { ...currentParams },
      adjustment: {
        previousLevel: currentLevel,
        newLevel: currentLevel,
        direction: 'unchanged',
        reason: 'Adaptive difficulty auto-adjustment is currently disabled in your preferences.',
      },
    };
  }

  // Avoid adjusting on incomplete micro-sessions with fewer than 3 targets
  if (totalTargets < 3) {
    return {
      newLevel: currentLevel,
      newParams: { ...currentParams },
      adjustment: {
        previousLevel: currentLevel,
        newLevel: currentLevel,
        direction: 'unchanged',
        reason: 'Session ended early with fewer than 3 targets, so difficulty parameters remain unchanged.',
      },
    };
  }

  const goodPerformance =
    accuracy >= 80 && (averageReactionTime === 0 || averageReactionTime <= currentParams.responseTimeMs * 0.72);
  const poorPerformance =
    accuracy < 55 || (averageReactionTime > 0 && averageReactionTime > currentParams.responseTimeMs * 0.92);

  if (goodPerformance) {
    const nextParams: IDifficultyParams = {
      targetSizePx: Math.round(clamp(currentParams.targetSizePx - 6, DIFFICULTY_LIMITS.targetSizePx.min, DIFFICULTY_LIMITS.targetSizePx.max)),
      targetSpeed: Number(clamp(currentParams.targetSpeed + 0.18, DIFFICULTY_LIMITS.targetSpeed.min, DIFFICULTY_LIMITS.targetSpeed.max).toFixed(2)),
      targetDistanceRatio: Number(clamp(currentParams.targetDistanceRatio + 0.06, DIFFICULTY_LIMITS.targetDistanceRatio.min, DIFFICULTY_LIMITS.targetDistanceRatio.max).toFixed(2)),
      targetCount: Math.round(clamp(currentParams.targetCount + 2, DIFFICULTY_LIMITS.targetCount.min, DIFFICULTY_LIMITS.targetCount.max)),
      responseTimeMs: Math.round(clamp(currentParams.responseTimeMs - 250, DIFFICULTY_LIMITS.responseTimeMs.min, DIFFICULTY_LIMITS.responseTimeMs.max)),
      holdDurationMs: Math.round(clamp(currentParams.holdDurationMs + 150, DIFFICULTY_LIMITS.holdDurationMs.min, DIFFICULTY_LIMITS.holdDurationMs.max)),
    };

    let newLevel: DifficultyLevel = currentLevel;
    if (currentLevel === 'beginner' && nextParams.targetSizePx <= 72) {
      newLevel = 'intermediate';
    } else if (currentLevel === 'intermediate' && nextParams.targetSizePx <= 56) {
      newLevel = 'advanced';
    }

    const levelChangedText =
      newLevel !== currentLevel
        ? `Promoted from ${capitalize(currentLevel)} to ${capitalize(newLevel)}. `
        : '';

    return {
      newLevel,
      newParams: nextParams,
      adjustment: {
        previousLevel: currentLevel,
        newLevel,
        direction: 'increased',
        reason: `${levelChangedText}Strong session (${accuracy.toFixed(0)}% accuracy). Targets are now slightly smaller (${nextParams.targetSizePx}px), faster (${nextParams.targetSpeed}x), and spaced further apart.`,
      },
    };
  }

  if (poorPerformance) {
    const nextParams: IDifficultyParams = {
      targetSizePx: Math.round(clamp(currentParams.targetSizePx + 6, DIFFICULTY_LIMITS.targetSizePx.min, DIFFICULTY_LIMITS.targetSizePx.max)),
      targetSpeed: Number(clamp(currentParams.targetSpeed - 0.18, DIFFICULTY_LIMITS.targetSpeed.min, DIFFICULTY_LIMITS.targetSpeed.max).toFixed(2)),
      targetDistanceRatio: Number(clamp(currentParams.targetDistanceRatio - 0.06, DIFFICULTY_LIMITS.targetDistanceRatio.min, DIFFICULTY_LIMITS.targetDistanceRatio.max).toFixed(2)),
      targetCount: Math.round(clamp(currentParams.targetCount - 2, DIFFICULTY_LIMITS.targetCount.min, DIFFICULTY_LIMITS.targetCount.max)),
      responseTimeMs: Math.round(clamp(currentParams.responseTimeMs + 300, DIFFICULTY_LIMITS.responseTimeMs.min, DIFFICULTY_LIMITS.responseTimeMs.max)),
      holdDurationMs: Math.round(clamp(currentParams.holdDurationMs - 150, DIFFICULTY_LIMITS.holdDurationMs.min, DIFFICULTY_LIMITS.holdDurationMs.max)),
    };

    let newLevel: DifficultyLevel = currentLevel;
    if (currentLevel === 'advanced' && nextParams.targetSizePx >= 60) {
      newLevel = 'intermediate';
    } else if (currentLevel === 'intermediate' && nextParams.targetSizePx >= 76) {
      newLevel = 'beginner';
    }

    const levelChangedText =
      newLevel !== currentLevel
        ? `Stepped down from ${capitalize(currentLevel)} to ${capitalize(newLevel)}. `
        : '';

    return {
      newLevel,
      newParams: nextParams,
      adjustment: {
        previousLevel: currentLevel,
        newLevel,
        direction: 'decreased',
        reason: `${levelChangedText}Session accuracy was ${accuracy.toFixed(0)}%. Targets are now larger (${nextParams.targetSizePx}px) with a wider response window (${(nextParams.responseTimeMs / 1000).toFixed(1)}s) for steadier practice.`,
      },
    };
  }

  return {
    newLevel: currentLevel,
    newParams: { ...currentParams },
    adjustment: {
      previousLevel: currentLevel,
      newLevel: currentLevel,
      direction: 'unchanged',
      reason: `Steady performance (${accuracy.toFixed(0)}% accuracy). Keeping ${capitalize(currentLevel)} parameters unchanged to build consistency.`,
    },
  };
}

export function buildRecommendations(input: {
  totalSessions: number;
  averageAccuracy: number;
  averageReactionTime: number;
  hasCalibration: boolean;
  recentGameTypes: string[];
  hasLeftAndRightSessions: boolean;
}): Array<{ title: string; detail: string; actionPath: string; actionLabel: string }> {
  const recs: Array<{ title: string; detail: string; actionPath: string; actionLabel: string }> = [];

  if (!input.hasCalibration) {
    recs.push({
      title: 'Complete eye calibration before your next session',
      detail: 'Recording 9 reference gaze points improves coordinate mapping for your screen size and seating distance.',
      actionPath: '/calibration',
      actionLabel: 'Open Calibration',
    });
  }

  if (input.totalSessions === 0) {
    recs.push({
      title: 'Start with Catch the Targets at Beginner level',
      detail: 'A short 45-second target exercise establishes your baseline accuracy and reaction time for adaptive difficulty.',
      actionPath: '/training',
      actionLabel: 'Start First Exercise',
    });
    return recs;
  }

  if (input.averageAccuracy < 65) {
    recs.push({
      title: 'Practice steady fixation with Focus and Hold',
      detail: `Your average accuracy is ${input.averageAccuracy.toFixed(1)}%. Stationary fixation drills help stabilize gaze tracking before faster target exercises.`,
      actionPath: '/training?game=focus-hold',
      actionLabel: 'Try Focus & Hold',
    });
  } else if (input.averageReactionTime > 2200) {
    recs.push({
      title: 'Build visual tracking speed with Catch the Targets',
      detail: `Your average reaction time is ${Math.round(input.averageReactionTime)} ms. Short target-acquisition intervals help improve saccade response.`,
      actionPath: '/training?game=catch-targets',
      actionLabel: 'Practice Catch Targets',
    });
  } else {
    recs.push({
      title: 'Challenge smooth pursuit with Follow the Moving Object',
      detail: `With ${input.averageAccuracy.toFixed(1)}% accuracy, continuous smooth-pursuit exercises can strengthen sustained tracking.`,
      actionPath: '/training?game=follow-object',
      actionLabel: 'Try Follow Object',
    });
  }

  if (!input.hasLeftAndRightSessions) {
    recs.push({
      title: 'Log separate Left Eye and Right Eye sessions to compare eyes',
      detail: 'Select Left Eye or Right Eye mode in Training to record monocular practice sessions and unlock side-by-side comparison charts.',
      actionPath: '/training',
      actionLabel: 'Configure Eye Mode',
    });
  }

  return recs.slice(0, 3);
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
