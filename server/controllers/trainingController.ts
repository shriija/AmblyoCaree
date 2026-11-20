import type { Response } from 'express';
import { repository } from '../services/repository.ts';
import { AppError, asyncHandler } from '../middleware/errorHandler.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import type { GameType, IDifficultyParams, InputMode } from '../models/TrainingSession.ts';
import type { DifficultyLevel, EyeMode } from '../models/User.ts';
import {
  buildRecommendations,
  DIFFICULTY_LIMITS,
  evaluateAdaptiveDifficulty,
  getPresetForLevel,
} from '../utils/adaptiveEngine.ts';

const VALID_GAMES: GameType[] = ['catch-targets', 'follow-object', 'focus-hold'];
const VALID_LEVELS: DifficultyLevel[] = ['beginner', 'intermediate', 'advanced'];
const VALID_EYES: EyeMode[] = ['both', 'left', 'right'];
const VALID_INPUTS: InputMode[] = ['webcam', 'mouse-fallback'];

export const createSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const body = req.body as {
    gameType?: GameType;
    difficultyLevel?: DifficultyLevel;
    difficultyParams?: IDifficultyParams;
    eyeMode?: EyeMode;
    inputMode?: InputMode;
    totalTargets?: number;
    targetsHit?: number;
    targetsMissed?: number;
    averageReactionTime?: number;
    score?: number;
    sessionDuration?: number;
    offScreenTime?: number;
    invalidSampleCount?: number;
  };

  if (!body.gameType || !VALID_GAMES.includes(body.gameType)) {
    throw new AppError('Invalid training exercise type.', 400);
  }

  const totalTargets = Math.max(0, Math.round(Number(body.totalTargets ?? 0)));
  const targetsHit = Math.max(0, Math.min(totalTargets, Math.round(Number(body.targetsHit ?? 0))));
  const targetsMissed = Math.max(0, totalTargets - targetsHit);
  // Accuracy = (Targets Hit / Total Targets) * 100
  const accuracy =
    totalTargets > 0 ? Number(((targetsHit / totalTargets) * 100).toFixed(1)) : 0;
  const averageReactionTime = Math.max(0, Math.round(Number(body.averageReactionTime ?? 0)));
  const score = Math.max(0, Math.round(Number(body.score ?? 0)));
  const sessionDuration = Math.max(1, Math.round(Number(body.sessionDuration ?? 1)));
  const offScreenTime = Math.max(0, Number(Number(body.offScreenTime ?? 0).toFixed(1)));
  const invalidSampleCount = Math.max(0, Math.round(Number(body.invalidSampleCount ?? 0)));

  const user = await repository.findUserById(userId);
  const progress = await repository.getOrCreateUserProgress(userId);

  const usedLevel: DifficultyLevel =
    body.difficultyLevel && VALID_LEVELS.includes(body.difficultyLevel)
      ? body.difficultyLevel
      : progress.currentDifficultyLevel;

  const usedParams: IDifficultyParams = body.difficultyParams || progress.adaptiveParams;
  const eyeMode: EyeMode = body.eyeMode && VALID_EYES.includes(body.eyeMode) ? body.eyeMode : 'both';
  const inputMode: InputMode =
    body.inputMode && VALID_INPUTS.includes(body.inputMode) ? body.inputMode : 'webcam';

  // Evaluate adaptive difficulty for the next session
  const adaptiveResult = evaluateAdaptiveDifficulty({
    currentLevel: usedLevel,
    currentParams: usedParams,
    accuracy,
    averageReactionTime,
    totalTargets,
    adaptiveEnabled: user?.preferences?.adaptiveEnabled ?? true,
  });

  const savedSession = await repository.createTrainingSession({
    userId,
    gameType: body.gameType,
    difficultyLevel: usedLevel,
    difficultyParams: usedParams,
    eyeMode,
    inputMode,
    totalTargets,
    targetsHit,
    targetsMissed,
    accuracy,
    averageReactionTime,
    score,
    sessionDuration,
    offScreenTime,
    invalidSampleCount,
    difficultyAdjustment: adaptiveResult.adjustment,
  });

  // Recompute real aggregate progress from all saved sessions for this user
  const allSessions = await repository.getUserSessions(userId);
  const totalSessions = allSessions.length;
  const totalTrainingTime = allSessions.reduce((sum, s) => sum + s.sessionDuration, 0);
  const totalScore = allSessions.reduce((sum, s) => sum + s.score, 0);
  const avgAccuracy =
    totalSessions > 0
      ? Number((allSessions.reduce((sum, s) => sum + s.accuracy, 0) / totalSessions).toFixed(1))
      : 0;
  const sessionsWithRt = allSessions.filter((s) => s.averageReactionTime > 0);
  const avgReactionTime =
    sessionsWithRt.length > 0
      ? Math.round(
          sessionsWithRt.reduce((sum, s) => sum + s.averageReactionTime, 0) / sessionsWithRt.length
        )
      : 0;

  const updatedProgress = await repository.upsertUserProgress(userId, {
    totalSessions,
    totalTrainingTime,
    averageAccuracy: avgAccuracy,
    averageReactionTime: avgReactionTime,
    totalScore,
    currentDifficultyLevel: adaptiveResult.newLevel,
    adaptiveParams: adaptiveResult.newParams,
    lastAdjustmentNote: adaptiveResult.adjustment.reason,
  });

  res.status(201).json({
    message: 'Training session saved successfully.',
    session: savedSession,
    progress: updatedProgress,
    difficultyAdjustment: adaptiveResult.adjustment,
  });
});

export const getSessions = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { range, gameType, limit } = req.query as {
    range?: string;
    gameType?: string;
    limit?: string;
  };

  let startDate: Date | undefined;
  const now = new Date();
  if (range === '7d') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === '30d') {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (range === '90d') {
    startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }

  const parsedLimit = limit ? Math.min(200, Math.max(1, parseInt(limit, 10))) : undefined;
  const sessions = await repository.getUserSessions(userId, {
    startDate,
    gameType,
    limit: parsedLimit,
  });

  res.status(200).json({ sessions });
});

export const getSessionById = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const session = await repository.getSessionById(userId, req.params.id);
  if (!session) {
    throw new AppError('Training session not found.', 404);
  }
  res.status(200).json({ session });
});

export const getAdaptiveState = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const user = await repository.findUserById(userId);
  const progress = await repository.getOrCreateUserProgress(userId);
  res.status(200).json({
    adaptiveEnabled: user?.preferences?.adaptiveEnabled ?? true,
    currentDifficultyLevel: progress.currentDifficultyLevel,
    adaptiveParams: progress.adaptiveParams,
    lastAdjustmentNote: progress.lastAdjustmentNote,
    limits: DIFFICULTY_LIMITS,
  });
});

export const setManualDifficulty = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { level } = req.body as { level?: DifficultyLevel };
  if (!level || !VALID_LEVELS.includes(level)) {
    throw new AppError('Invalid difficulty level. Choose beginner, intermediate, or advanced.', 400);
  }
  const params = getPresetForLevel(level);
  const updated = await repository.upsertUserProgress(userId, {
    currentDifficultyLevel: level,
    adaptiveParams: params,
    lastAdjustmentNote: `Difficulty preset switched to ${level.charAt(0).toUpperCase() + level.slice(1)}.`,
  });
  res.status(200).json({
    message: 'Difficulty level updated.',
    progress: updated,
  });
});

export const getAnalytics = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { range, gameType } = req.query as { range?: string; gameType?: string };

  let startDate: Date | undefined;
  const now = new Date();
  if (range === '7d') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === '30d') {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (range === '90d') {
    startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }

  const [filteredSessions, allSessions, progress, calibration] = await Promise.all([
    repository.getUserSessions(userId, { startDate, gameType }),
    repository.getUserSessions(userId),
    repository.getOrCreateUserProgress(userId),
    repository.getLatestCalibration(userId),
  ]);

  // Chronological order for trend charts
  const chronological = [...filteredSessions].reverse();

  const trendSeries = chronological.map((s, idx) => ({
    sessionId: s._id,
    label: `#${idx + 1} · ${new Date(s.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })}`,
    date: new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    accuracy: s.accuracy,
    reactionTime: s.averageReactionTime,
    score: s.score,
    gameType: s.gameType,
    difficultyLevel: s.difficultyLevel,
    eyeMode: s.eyeMode,
  }));

  // Group daily activity for bar chart (real dates only)
  const dailyMap = new Map<
    string,
    { date: string; sessions: number; totalScore: number; totalMinutes: number; accuracySum: number }
  >();

  for (const s of chronological) {
    const key = new Date(s.createdAt).toISOString().slice(0, 10);
    const label = new Date(s.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const prev = dailyMap.get(key) || {
      date: label,
      sessions: 0,
      totalScore: 0,
      totalMinutes: 0,
      accuracySum: 0,
    };
    prev.sessions += 1;
    prev.totalScore += s.score;
    prev.totalMinutes = Number((prev.totalMinutes + s.sessionDuration / 60).toFixed(1));
    prev.accuracySum += s.accuracy;
    dailyMap.set(key, prev);
  }

  const dailyActivity = Array.from(dailyMap.values()).map((d) => ({
    date: d.date,
    sessions: d.sessions,
    totalScore: d.totalScore,
    totalMinutes: d.totalMinutes,
    avgAccuracy: Number((d.accuracySum / d.sessions).toFixed(1)),
  }));

  // Left-eye vs Right-eye comparison ONLY from sessions where eyeMode was separately measured
  const leftSessions = filteredSessions.filter((s) => s.eyeMode === 'left');
  const rightSessions = filteredSessions.filter((s) => s.eyeMode === 'right');

  const computeEyeSummary = (list: typeof filteredSessions) => {
    if (list.length === 0) return null;
    const rtList = list.filter((s) => s.averageReactionTime > 0);
    return {
      sessions: list.length,
      averageAccuracy: Number(
        (list.reduce((sum, s) => sum + s.accuracy, 0) / list.length).toFixed(1)
      ),
      averageReactionTime:
        rtList.length > 0
          ? Math.round(rtList.reduce((sum, s) => sum + s.averageReactionTime, 0) / rtList.length)
          : 0,
      totalScore: list.reduce((sum, s) => sum + s.score, 0),
    };
  };

  const eyeComparison = {
    supported: leftSessions.length > 0 || rightSessions.length > 0,
    left: computeEyeSummary(leftSessions),
    right: computeEyeSummary(rightSessions),
  };

  // Filtered summary
  const filteredTotalSessions = filteredSessions.length;
  const filteredTotalTime = filteredSessions.reduce((sum, s) => sum + s.sessionDuration, 0);
  const filteredTotalScore = filteredSessions.reduce((sum, s) => sum + s.score, 0);
  const filteredAvgAccuracy =
    filteredTotalSessions > 0
      ? Number(
          (
            filteredSessions.reduce((sum, s) => sum + s.accuracy, 0) / filteredTotalSessions
          ).toFixed(1)
        )
      : 0;
  const filteredWithRt = filteredSessions.filter((s) => s.averageReactionTime > 0);
  const filteredAvgRt =
    filteredWithRt.length > 0
      ? Math.round(
          filteredWithRt.reduce((sum, s) => sum + s.averageReactionTime, 0) / filteredWithRt.length
        )
      : 0;

  const recommendations = buildRecommendations({
    totalSessions: allSessions.length,
    averageAccuracy: progress.averageAccuracy,
    averageReactionTime: progress.averageReactionTime,
    hasCalibration: Boolean(calibration && calibration.calibrationStatus === 'completed'),
    recentGameTypes: allSessions.slice(0, 5).map((s) => s.gameType),
    hasLeftAndRightSessions:
      allSessions.some((s) => s.eyeMode === 'left') &&
      allSessions.some((s) => s.eyeMode === 'right'),
  });

  res.status(200).json({
    progress,
    summary: {
      totalSessions: filteredTotalSessions,
      totalTrainingTime: filteredTotalTime,
      averageAccuracy: filteredAvgAccuracy,
      averageReactionTime: filteredAvgRt,
      totalScore: filteredTotalScore,
    },
    calibrationStatus: calibration ? calibration.calibrationStatus : 'none',
    lastCalibratedAt: calibration ? calibration.createdAt : null,
    trendSeries,
    dailyActivity,
    eyeComparison,
    recentSessions: filteredSessions.slice(0, 20),
    recommendations,
  });
});
