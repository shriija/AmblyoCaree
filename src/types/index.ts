export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type EyeMode = 'both' | 'left' | 'right';
export type AffectedEye = 'left' | 'right' | 'not-sure';
export type PracticeMode = 'affected-eye-only' | 'both-eyes';
export type GameType = 'catch-targets' | 'follow-object' | 'focus-hold';
export type InputMode = 'webcam' | 'mouse-fallback';
export type GazeStatus = 'ok' | 'off-screen' | 'face-lost';

export interface UserPreferences {
  preferredCameraId: string;
  targetEye: EyeMode;
  adaptiveEnabled: boolean;
  preferredDifficulty: DifficultyLevel;
  showGazeIndicator: boolean;
  sessionDurationSec: number;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  profileImage: string;
  preferences: UserPreferences;
  createdAt: string;
}

export interface CalibrationPointData {
  id: number;
  label: string;
  screenXNorm: number;
  screenYNorm: number;
  rawX: number;
  rawY: number;
  leftIrisX: number;
  leftIrisY: number;
  rightIrisX: number;
  rightIrisY: number;
  samplesCollected: number;
}

export interface RegressionModel {
  meanX: number;
  stdX: number;
  meanY: number;
  stdY: number;
  weightsX: number[];
  weightsY: number[];
  lambda: number;
}

export interface ValidationPointError {
  id: number;
  label: string;
  errorPx: number;
}

export interface ValidationError {
  meanErrorPx: number;
  meanErrorPct: number;
  maxErrorPx: number;
  thresholdPct: number;
  passed: boolean;
  pointsEvaluated: number;
  pointErrors?: ValidationPointError[];
}

export interface ReferenceValues {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  screenWidth: number;
  screenHeight: number;
  centerX: number;
  centerY: number;
  calibrationQuality: number;
  regressionModel?: RegressionModel;
  leftEyeBounds?: { xMin: number; xMax: number; yMin: number; yMax: number };
  rightEyeBounds?: { xMin: number; xMax: number; yMin: number; yMax: number };
}

export interface ModeCalibrationMapping {
  modeKey: EyeMode;
  calibrationPoints: CalibrationPointData[];
  referenceValues: ReferenceValues;
  validationError?: ValidationError | null;
  lowConfidence?: boolean;
  calibratedAt: string;
}

export interface ModeMappings {
  both?: ModeCalibrationMapping;
  left?: ModeCalibrationMapping;
  right?: ModeCalibrationMapping;
}

export interface CalibrationRecord {
  _id: string;
  userId: string;
  affectedEye: AffectedEye;
  practiceMode: PracticeMode;
  activeTrackingMode: EyeMode;
  modeMappings: ModeMappings;
  calibrationPoints: CalibrationPointData[];
  referenceValues: ReferenceValues | null;
  validationError?: ValidationError | null;
  lowConfidence?: boolean;
  calibrationStatus: 'completed' | 'incomplete' | 'failed';
  createdAt: string;
  updatedAt?: string;
}

export interface DifficultyParams {
  targetSizePx: number;
  targetSpeed: number;
  targetDistanceRatio: number;
  targetCount: number;
  responseTimeMs: number;
  holdDurationMs: number;
}

export interface DifficultyAdjustment {
  previousLevel: DifficultyLevel;
  newLevel: DifficultyLevel;
  direction: 'increased' | 'decreased' | 'unchanged';
  reason: string;
}

export interface TrainingSession {
  _id: string;
  userId: string;
  gameType: GameType;
  difficultyLevel: DifficultyLevel;
  difficultyParams: DifficultyParams;
  eyeMode: EyeMode;
  inputMode: InputMode;
  totalTargets: number;
  targetsHit: number;
  targetsMissed: number;
  accuracy: number;
  averageReactionTime: number;
  score: number;
  sessionDuration: number;
  offScreenTime?: number;
  invalidSampleCount?: number;
  difficultyAdjustment?: DifficultyAdjustment;
  createdAt: string;
}

export interface UserProgress {
  _id: string;
  userId: string;
  totalSessions: number;
  totalTrainingTime: number;
  averageAccuracy: number;
  averageReactionTime: number;
  totalScore: number;
  currentDifficultyLevel: DifficultyLevel;
  adaptiveParams: DifficultyParams;
  lastAdjustmentNote: string;
  updatedAt: string;
}

export interface EyeComparisonSummary {
  sessions: number;
  averageAccuracy: number;
  averageReactionTime: number;
  totalScore: number;
}

export interface AnalyticsOverview {
  progress: UserProgress;
  summary: {
    totalSessions: number;
    totalTrainingTime: number;
    averageAccuracy: number;
    averageReactionTime: number;
    totalScore: number;
  };
  calibrationStatus: 'completed' | 'incomplete' | 'failed' | 'none';
  lastCalibratedAt: string | null;
  trendSeries: Array<{
    sessionId: string;
    label: string;
    date: string;
    accuracy: number;
    reactionTime: number;
    score: number;
    gameType: GameType;
    difficultyLevel: DifficultyLevel;
    eyeMode: EyeMode;
  }>;
  dailyActivity: Array<{
    date: string;
    sessions: number;
    totalScore: number;
    totalMinutes: number;
    avgAccuracy: number;
  }>;
  eyeComparison: {
    supported: boolean;
    left: EyeComparisonSummary | null;
    right: EyeComparisonSummary | null;
  };
  recentSessions: TrainingSession[];
  recommendations: Array<{
    title: string;
    detail: string;
    actionPath: string;
    actionLabel: string;
  }>;
}
