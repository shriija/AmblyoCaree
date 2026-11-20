import mongoose, { Schema, Document } from 'mongoose';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type EyeMode = 'both' | 'left' | 'right';

export interface IUserPreferences {
  preferredCameraId: string;
  targetEye: EyeMode;
  adaptiveEnabled: boolean;
  preferredDifficulty: DifficultyLevel;
  showGazeIndicator: boolean;
  sessionDurationSec: number;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  profileImage: string;
  preferences: IUserPreferences;
  resetToken?: string | null;
  resetTokenExpiry?: Date | null;
  createdAt: Date;
}

const userPreferencesSchema = new Schema<IUserPreferences>(
  {
    preferredCameraId: { type: String, default: '' },
    targetEye: { type: String, enum: ['both', 'left', 'right'], default: 'both' },
    adaptiveEnabled: { type: Boolean, default: true },
    preferredDifficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    showGazeIndicator: { type: Boolean, default: true },
    sessionDurationSec: { type: Number, default: 45, min: 15, max: 180 },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  profileImage: { type: String, default: '' },
  preferences: { type: userPreferencesSchema, default: () => ({}) },
  resetToken: { type: String, default: null },
  resetTokenExpiry: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

export const UserModel =
  (mongoose.models.User as mongoose.Model<IUser>) || mongoose.model<IUser>('User', userSchema);
