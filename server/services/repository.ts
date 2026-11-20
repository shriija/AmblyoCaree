import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { isMongoConnected } from '../config/database.ts';
import { UserModel, type DifficultyLevel, type IUserPreferences } from '../models/User.ts';
import {
  CalibrationModel,
  type AffectedEye,
  type CalibrationModeKey,
  type ICalibrationPoint,
  type IModeMappings,
  type IReferenceValues,
  type IValidationError,
  type PracticeMode,
} from '../models/Calibration.ts';
import {
  TrainingSessionModel,
  type GameType,
  type IDifficultyAdjustment,
  type IDifficultyParams,
  type InputMode,
} from '../models/TrainingSession.ts';
import { UserProgressModel } from '../models/UserProgress.ts';
import { getPresetForLevel } from '../utils/adaptiveEngine.ts';
import type { EyeMode } from '../models/User.ts';

export interface UserRecord {
  _id: string;
  name: string;
  email: string;
  password: string;
  profileImage: string;
  preferences: IUserPreferences;
  resetToken?: string | null;
  resetTokenExpiry?: string | null;
  createdAt: string;
}

export interface CalibrationRecord {
  _id: string;
  userId: string;
  affectedEye: AffectedEye;
  practiceMode: PracticeMode;
  activeTrackingMode: CalibrationModeKey;
  modeMappings: IModeMappings;
  calibrationPoints: ICalibrationPoint[];
  referenceValues: IReferenceValues | null;
  validationError?: IValidationError | null;
  lowConfidence?: boolean;
  calibrationStatus: 'completed' | 'incomplete' | 'failed';
  createdAt: string;
  updatedAt?: string;
}

export interface TrainingSessionRecord {
  _id: string;
  userId: string;
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
  offScreenTime: number;
  invalidSampleCount: number;
  difficultyAdjustment?: IDifficultyAdjustment;
  createdAt: string;
}

export interface UserProgressRecord {
  _id: string;
  userId: string;
  totalSessions: number;
  totalTrainingTime: number;
  averageAccuracy: number;
  averageReactionTime: number;
  totalScore: number;
  currentDifficultyLevel: DifficultyLevel;
  adaptiveParams: IDifficultyParams;
  lastAdjustmentNote: string;
  updatedAt: string;
}

interface LocalDbSchema {
  users: UserRecord[];
  calibrations: CalibrationRecord[];
  trainingSessions: TrainingSessionRecord[];
  userProgress: UserProgressRecord[];
}

const DB_FILE = path.resolve(process.cwd(), 'data', 'amblyocare-db.json');

function defaultPreferences(): IUserPreferences {
  return {
    preferredCameraId: '',
    targetEye: 'both',
    adaptiveEnabled: true,
    preferredDifficulty: 'beginner',
    showGazeIndicator: true,
    sessionDurationSec: 45,
  };
}

function readLocalDb(): LocalDbSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initial: LocalDbSchema = {
        users: [],
        calibrations: [],
        trainingSessions: [],
        userProgress: [],
      };
      fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<LocalDbSchema>;
    return {
      users: parsed.users || [],
      calibrations: parsed.calibrations || [],
      trainingSessions: parsed.trainingSessions || [],
      userProgress: parsed.userProgress || [],
    };
  } catch {
    return { users: [], calibrations: [], trainingSessions: [], userProgress: [] };
  }
}

function writeLocalDb(data: LocalDbSchema): void {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function newId(): string {
  return new mongoose.Types.ObjectId().toString();
}

function serializeDoc<T>(doc: unknown): T {
  return JSON.parse(JSON.stringify(doc)) as T;
}

export const repository = {
  // ---- Users ----
  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.toLowerCase().trim();
    if (isMongoConnected()) {
      const doc = await UserModel.findOne({ email: normalized }).lean();
      return doc ? serializeDoc<UserRecord>(doc) : null;
    }
    const db = readLocalDb();
    return db.users.find((u) => u.email.toLowerCase() === normalized) || null;
  },

  async findUserById(id: string): Promise<UserRecord | null> {
    if (isMongoConnected()) {
      if (!mongoose.Types.ObjectId.isValid(id)) return null;
      const doc = await UserModel.findById(id).lean();
      return doc ? serializeDoc<UserRecord>(doc) : null;
    }
    const db = readLocalDb();
    return db.users.find((u) => u._id === id) || null;
  },

  async findUserByResetToken(token: string): Promise<UserRecord | null> {
    if (isMongoConnected()) {
      const doc = await UserModel.findOne({ resetToken: token }).lean();
      return doc ? serializeDoc<UserRecord>(doc) : null;
    }
    const db = readLocalDb();
    return db.users.find((u) => u.resetToken === token) || null;
  },

  async createUser(input: {
    name: string;
    email: string;
    password: string;
    profileImage?: string;
  }): Promise<UserRecord> {
    const normalizedEmail = input.email.toLowerCase().trim();
    const prefs = defaultPreferences();
    if (isMongoConnected()) {
      const created = await UserModel.create({
        name: input.name.trim(),
        email: normalizedEmail,
        password: input.password,
        profileImage: input.profileImage || '',
        preferences: prefs,
      });
      return serializeDoc<UserRecord>(created.toObject());
    }
    const db = readLocalDb();
    const user: UserRecord = {
      _id: newId(),
      name: input.name.trim(),
      email: normalizedEmail,
      password: input.password,
      profileImage: input.profileImage || '',
      preferences: prefs,
      resetToken: null,
      resetTokenExpiry: null,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    writeLocalDb(db);
    return user;
  },

  async updateUser(
    id: string,
    updates: Partial<Omit<UserRecord, '_id' | 'createdAt'>>
  ): Promise<UserRecord | null> {
    if (isMongoConnected()) {
      const updated = await UserModel.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
      return updated ? serializeDoc<UserRecord>(updated) : null;
    }
    const db = readLocalDb();
    const index = db.users.findIndex((u) => u._id === id);
    if (index === -1) return null;
    db.users[index] = {
      ...db.users[index],
      ...updates,
      preferences: updates.preferences
        ? { ...db.users[index].preferences, ...updates.preferences }
        : db.users[index].preferences,
    };
    writeLocalDb(db);
    return db.users[index];
  },

  // ---- Calibrations ----
  async saveCalibration(input: {
    userId: string;
    affectedEye: AffectedEye;
    practiceMode: PracticeMode;
    activeTrackingMode: CalibrationModeKey;
    calibrationPoints: ICalibrationPoint[];
    referenceValues: IReferenceValues;
    validationError?: IValidationError | null;
    lowConfidence?: boolean;
    calibrationStatus: 'completed' | 'incomplete' | 'failed';
  }): Promise<CalibrationRecord> {
    const existing = await this.getLatestCalibration(input.userId);
    const nowIso = new Date().toISOString();
    const isLowConfidence = Boolean(input.lowConfidence);
    const mergedMappings: IModeMappings = {
      ...(existing?.modeMappings || {}),
      [input.activeTrackingMode]: {
        modeKey: input.activeTrackingMode,
        calibrationPoints: input.calibrationPoints,
        referenceValues: input.referenceValues,
        validationError: input.validationError ?? null,
        lowConfidence: isLowConfidence,
        calibratedAt: nowIso,
      },
    };

    if (isMongoConnected()) {
      if (existing) {
        const updated = await CalibrationModel.findByIdAndUpdate(
          existing._id,
          {
            $set: {
              affectedEye: input.affectedEye,
              practiceMode: input.practiceMode,
              activeTrackingMode: input.activeTrackingMode,
              modeMappings: mergedMappings,
              calibrationPoints: input.calibrationPoints,
              referenceValues: input.referenceValues,
              validationError: input.validationError ?? null,
              lowConfidence: isLowConfidence,
              calibrationStatus: input.calibrationStatus,
              updatedAt: new Date(),
            },
          },
          { new: true }
        ).lean();
        if (updated) return serializeDoc<CalibrationRecord>(updated);
      }

      const created = await CalibrationModel.create({
        userId: new mongoose.Types.ObjectId(input.userId),
        affectedEye: input.affectedEye,
        practiceMode: input.practiceMode,
        activeTrackingMode: input.activeTrackingMode,
        modeMappings: mergedMappings,
        calibrationPoints: input.calibrationPoints,
        referenceValues: input.referenceValues,
        validationError: input.validationError ?? null,
        lowConfidence: isLowConfidence,
        calibrationStatus: input.calibrationStatus,
        updatedAt: new Date(),
      });
      return serializeDoc<CalibrationRecord>(created.toObject());
    }

    const db = readLocalDb();
    const existingIndex = db.calibrations.findIndex((c) => c.userId === input.userId);
    const record: CalibrationRecord = {
      _id: existingIndex !== -1 ? db.calibrations[existingIndex]._id : newId(),
      userId: input.userId,
      affectedEye: input.affectedEye,
      practiceMode: input.practiceMode,
      activeTrackingMode: input.activeTrackingMode,
      modeMappings: mergedMappings,
      calibrationPoints: input.calibrationPoints,
      referenceValues: input.referenceValues,
      validationError: input.validationError ?? null,
      lowConfidence: isLowConfidence,
      calibrationStatus: input.calibrationStatus,
      createdAt: existingIndex !== -1 ? db.calibrations[existingIndex].createdAt : nowIso,
      updatedAt: nowIso,
    };

    if (existingIndex !== -1) {
      db.calibrations[existingIndex] = record;
    } else {
      db.calibrations.push(record);
    }
    writeLocalDb(db);
    return record;
  },

  async updateCalibrationMode(input: {
    userId: string;
    affectedEye: AffectedEye;
    practiceMode: PracticeMode;
    activeTrackingMode: CalibrationModeKey;
  }): Promise<CalibrationRecord> {
    const existing = await this.getLatestCalibration(input.userId);
    const nowIso = new Date().toISOString();
    const existingMappings: IModeMappings = existing?.modeMappings || {};
    const activeMapping = existingMappings[input.activeTrackingMode];
    const hasMappingForMode = Boolean(
      activeMapping &&
        activeMapping.referenceValues &&
        (activeMapping.validationError?.passed === true || activeMapping.lowConfidence === true)
    );

    if (isMongoConnected()) {
      if (existing) {
        const updated = await CalibrationModel.findByIdAndUpdate(
          existing._id,
          {
            $set: {
              affectedEye: input.affectedEye,
              practiceMode: input.practiceMode,
              activeTrackingMode: input.activeTrackingMode,
              calibrationPoints: hasMappingForMode ? activeMapping!.calibrationPoints : [],
              referenceValues: hasMappingForMode ? activeMapping!.referenceValues : null,
              validationError: hasMappingForMode ? activeMapping!.validationError ?? null : null,
              lowConfidence: hasMappingForMode ? Boolean(activeMapping!.lowConfidence) : false,
              calibrationStatus: hasMappingForMode ? 'completed' : 'incomplete',
              updatedAt: new Date(),
            },
          },
          { new: true }
        ).lean();
        if (updated) return serializeDoc<CalibrationRecord>(updated);
      }

      const created = await CalibrationModel.create({
        userId: new mongoose.Types.ObjectId(input.userId),
        affectedEye: input.affectedEye,
        practiceMode: input.practiceMode,
        activeTrackingMode: input.activeTrackingMode,
        modeMappings: {},
        calibrationPoints: [],
        referenceValues: null,
        validationError: null,
        lowConfidence: false,
        calibrationStatus: 'incomplete',
        updatedAt: new Date(),
      });
      return serializeDoc<CalibrationRecord>(created.toObject());
    }

    const db = readLocalDb();
    const existingIndex = db.calibrations.findIndex((c) => c.userId === input.userId);
    const record: CalibrationRecord = {
      _id: existingIndex !== -1 ? db.calibrations[existingIndex]._id : newId(),
      userId: input.userId,
      affectedEye: input.affectedEye,
      practiceMode: input.practiceMode,
      activeTrackingMode: input.activeTrackingMode,
      modeMappings: existingMappings,
      calibrationPoints: hasMappingForMode ? activeMapping!.calibrationPoints : [],
      referenceValues: hasMappingForMode ? activeMapping!.referenceValues : null,
      validationError: hasMappingForMode ? activeMapping!.validationError ?? null : null,
      lowConfidence: hasMappingForMode ? Boolean(activeMapping!.lowConfidence) : false,
      calibrationStatus: hasMappingForMode ? 'completed' : 'incomplete',
      createdAt: existingIndex !== -1 ? db.calibrations[existingIndex].createdAt : nowIso,
      updatedAt: nowIso,
    };

    if (existingIndex !== -1) {
      db.calibrations[existingIndex] = record;
    } else {
      db.calibrations.push(record);
    }
    writeLocalDb(db);
    return record;
  },

  async getLatestCalibration(userId: string): Promise<CalibrationRecord | null> {
    if (isMongoConnected()) {
      const doc = await CalibrationModel.findOne({ userId })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();
      return doc ? serializeDoc<CalibrationRecord>(doc) : null;
    }
    const db = readLocalDb();
    const matches = db.calibrations
      .filter((c) => c.userId === userId)
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
      );
    return matches[0] || null;
  },

  async deleteUserCalibrations(userId: string): Promise<void> {
    if (isMongoConnected()) {
      await CalibrationModel.deleteMany({ userId });
      return;
    }
    const db = readLocalDb();
    db.calibrations = db.calibrations.filter((c) => c.userId !== userId);
    writeLocalDb(db);
  },

  // ---- Training Sessions ----
  async createTrainingSession(
    input: Omit<TrainingSessionRecord, '_id' | 'createdAt'>
  ): Promise<TrainingSessionRecord> {
    if (isMongoConnected()) {
      const created = await TrainingSessionModel.create({
        ...input,
        userId: new mongoose.Types.ObjectId(input.userId),
      });
      return serializeDoc<TrainingSessionRecord>(created.toObject());
    }
    const db = readLocalDb();
    const record: TrainingSessionRecord = {
      ...input,
      _id: newId(),
      createdAt: new Date().toISOString(),
    };
    db.trainingSessions.push(record);
    writeLocalDb(db);
    return record;
  },

  async getUserSessions(
    userId: string,
    options?: { startDate?: Date; endDate?: Date; gameType?: string; limit?: number }
  ): Promise<TrainingSessionRecord[]> {
    if (isMongoConnected()) {
      const filter: Record<string, unknown> = { userId };
      if (options?.gameType && options.gameType !== 'all') {
        filter.gameType = options.gameType;
      }
      if (options?.startDate || options?.endDate) {
        const range: Record<string, Date> = {};
        if (options.startDate) range.$gte = options.startDate;
        if (options.endDate) range.$lte = options.endDate;
        filter.createdAt = range;
      }
      let query = TrainingSessionModel.find(filter).sort({ createdAt: -1 });
      if (options?.limit) query = query.limit(options.limit);
      const docs = await query.lean();
      return serializeDoc<TrainingSessionRecord[]>(docs);
    }
    const db = readLocalDb();
    let sessions = db.trainingSessions.filter((s) => s.userId === userId);
    if (options?.gameType && options.gameType !== 'all') {
      sessions = sessions.filter((s) => s.gameType === options.gameType);
    }
    if (options?.startDate) {
      const startMs = options.startDate.getTime();
      sessions = sessions.filter((s) => new Date(s.createdAt).getTime() >= startMs);
    }
    if (options?.endDate) {
      const endMs = options.endDate.getTime();
      sessions = sessions.filter((s) => new Date(s.createdAt).getTime() <= endMs);
    }
    sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (options?.limit) {
      sessions = sessions.slice(0, options.limit);
    }
    return sessions;
  },

  async getSessionById(userId: string, sessionId: string): Promise<TrainingSessionRecord | null> {
    if (isMongoConnected()) {
      if (!mongoose.Types.ObjectId.isValid(sessionId)) return null;
      const doc = await TrainingSessionModel.findOne({ _id: sessionId, userId }).lean();
      return doc ? serializeDoc<TrainingSessionRecord>(doc) : null;
    }
    const db = readLocalDb();
    return db.trainingSessions.find((s) => s._id === sessionId && s.userId === userId) || null;
  },

  // ---- User Progress ----
  async getOrCreateUserProgress(userId: string): Promise<UserProgressRecord> {
    if (isMongoConnected()) {
      let doc = await UserProgressModel.findOne({ userId }).lean();
      if (!doc) {
        const created = await UserProgressModel.create({
          userId: new mongoose.Types.ObjectId(userId),
          currentDifficultyLevel: 'beginner',
          adaptiveParams: getPresetForLevel('beginner'),
        });
        doc = created.toObject();
      }
      return serializeDoc<UserProgressRecord>(doc);
    }
    const db = readLocalDb();
    let existing = db.userProgress.find((p) => p.userId === userId);
    if (!existing) {
      existing = {
        _id: newId(),
        userId,
        totalSessions: 0,
        totalTrainingTime: 0,
        averageAccuracy: 0,
        averageReactionTime: 0,
        totalScore: 0,
        currentDifficultyLevel: 'beginner',
        adaptiveParams: getPresetForLevel('beginner'),
        lastAdjustmentNote:
          'Starting at Beginner baseline. Parameters adapt automatically after completed sessions.',
        updatedAt: new Date().toISOString(),
      };
      db.userProgress.push(existing);
      writeLocalDb(db);
    }
    return existing;
  },

  async upsertUserProgress(
    userId: string,
    updates: Partial<Omit<UserProgressRecord, '_id' | 'userId'>>
  ): Promise<UserProgressRecord> {
    if (isMongoConnected()) {
      const updated = await UserProgressModel.findOneAndUpdate(
        { userId },
        { $set: { ...updates, updatedAt: new Date() } },
        { new: true, upsert: true }
      ).lean();
      return serializeDoc<UserProgressRecord>(updated);
    }
    const db = readLocalDb();
    const index = db.userProgress.findIndex((p) => p.userId === userId);
    const now = new Date().toISOString();
    if (index === -1) {
      const created: UserProgressRecord = {
        _id: newId(),
        userId,
        totalSessions: updates.totalSessions ?? 0,
        totalTrainingTime: updates.totalTrainingTime ?? 0,
        averageAccuracy: updates.averageAccuracy ?? 0,
        averageReactionTime: updates.averageReactionTime ?? 0,
        totalScore: updates.totalScore ?? 0,
        currentDifficultyLevel: updates.currentDifficultyLevel ?? 'beginner',
        adaptiveParams: updates.adaptiveParams ?? getPresetForLevel('beginner'),
        lastAdjustmentNote:
          updates.lastAdjustmentNote ??
          'Starting at Beginner baseline. Parameters adapt automatically after completed sessions.',
        updatedAt: now,
      };
      db.userProgress.push(created);
      writeLocalDb(db);
      return created;
    }
    db.userProgress[index] = {
      ...db.userProgress[index],
      ...updates,
      updatedAt: now,
    };
    writeLocalDb(db);
    return db.userProgress[index];
  },
};
