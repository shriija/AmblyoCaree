import mongoose, { Schema, Document } from 'mongoose';
import type { DifficultyLevel } from './User.ts';
import type { IDifficultyParams } from './TrainingSession.ts';

export interface IUserProgress extends Document {
  userId: mongoose.Types.ObjectId;
  totalSessions: number;
  totalTrainingTime: number;
  averageAccuracy: number;
  averageReactionTime: number;
  totalScore: number;
  currentDifficultyLevel: DifficultyLevel;
  adaptiveParams: IDifficultyParams;
  lastAdjustmentNote: string;
  updatedAt: Date;
}

const userProgressSchema = new Schema<IUserProgress>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  totalSessions: { type: Number, default: 0 },
  totalTrainingTime: { type: Number, default: 0 },
  averageAccuracy: { type: Number, default: 0 },
  averageReactionTime: { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 },
  currentDifficultyLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner',
  },
  adaptiveParams: {
    targetSizePx: { type: Number, default: 84 },
    targetSpeed: { type: Number, default: 1.0 },
    targetDistanceRatio: { type: Number, default: 0.48 },
    targetCount: { type: Number, default: 10 },
    responseTimeMs: { type: Number, default: 4200 },
    holdDurationMs: { type: Number, default: 1400 },
  },
  lastAdjustmentNote: {
    type: String,
    default: 'Starting at Beginner baseline. Parameters adapt automatically after completed sessions.',
  },
  updatedAt: { type: Date, default: Date.now },
});

export const UserProgressModel =
  (mongoose.models.UserProgress as mongoose.Model<IUserProgress>) ||
  mongoose.model<IUserProgress>('UserProgress', userProgressSchema);
