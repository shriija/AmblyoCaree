import mongoose, { Schema, Document } from 'mongoose';
import type { DifficultyLevel, EyeMode } from './User.ts';

export type GameType = 'catch-targets' | 'follow-object' | 'focus-hold';
export type InputMode = 'webcam' | 'mouse-fallback';

export interface IDifficultyParams {
  targetSizePx: number;
  targetSpeed: number;
  targetDistanceRatio: number;
  targetCount: number;
  responseTimeMs: number;
  holdDurationMs: number;
}

export interface IDifficultyAdjustment {
  previousLevel: DifficultyLevel;
  newLevel: DifficultyLevel;
  direction: 'increased' | 'decreased' | 'unchanged';
  reason: string;
}

export interface ITrainingSession extends Document {
  userId: mongoose.Types.ObjectId;
  gameType: GameType;
  difficultyLevel: DifficultyLevel;
  difficultyParams: IDifficultyParams;
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
  difficultyAdjustment?: IDifficultyAdjustment;
  createdAt: Date;
}

const trainingSessionSchema = new Schema<ITrainingSession>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  gameType: {
    type: String,
    enum: ['catch-targets', 'follow-object', 'focus-hold'],
    required: true,
  },
  difficultyLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    required: true,
  },
  difficultyParams: {
    targetSizePx: { type: Number, required: true },
    targetSpeed: { type: Number, required: true },
    targetDistanceRatio: { type: Number, required: true },
    targetCount: { type: Number, required: true },
    responseTimeMs: { type: Number, required: true },
    holdDurationMs: { type: Number, required: true },
  },
  eyeMode: { type: String, enum: ['both', 'left', 'right'], default: 'both' },
  inputMode: { type: String, enum: ['webcam', 'mouse-fallback'], default: 'webcam' },
  totalTargets: { type: Number, required: true, min: 0 },
  targetsHit: { type: Number, required: true, min: 0 },
  targetsMissed: { type: Number, required: true, min: 0 },
  accuracy: { type: Number, required: true, min: 0, max: 100 },
  averageReactionTime: { type: Number, required: true, min: 0 },
  score: { type: Number, required: true, min: 0 },
  sessionDuration: { type: Number, required: true, min: 0 },
  offScreenTime: { type: Number, default: 0, min: 0 },
  invalidSampleCount: { type: Number, default: 0, min: 0 },
  difficultyAdjustment: {
    previousLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
    newLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
    direction: { type: String, enum: ['increased', 'decreased', 'unchanged'] },
    reason: String,
  },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const TrainingSessionModel =
  (mongoose.models.TrainingSession as mongoose.Model<ITrainingSession>) ||
  mongoose.model<ITrainingSession>('TrainingSession', trainingSessionSchema);
