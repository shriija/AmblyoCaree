import mongoose, { Schema, Document } from 'mongoose';

export type AffectedEye = 'left' | 'right' | 'not-sure';
export type PracticeMode = 'affected-eye-only' | 'both-eyes';
export type CalibrationModeKey = 'both' | 'left' | 'right';

export interface ICalibrationPoint {
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

export interface IRegressionModel {
  meanX: number;
  stdX: number;
  meanY: number;
  stdY: number;
  weightsX: number[];
  weightsY: number[];
  lambda: number;
}

export interface IValidationError {
  meanErrorPx: number;
  meanErrorPct: number;
  maxErrorPx: number;
  thresholdPct: number;
  passed: boolean;
  pointsEvaluated: number;
  pointErrors?: Array<{ id: number; label: string; errorPx: number }>;
}

export interface IReferenceValues {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  screenWidth: number;
  screenHeight: number;
  centerX: number;
  centerY: number;
  calibrationQuality: number;
  regressionModel?: IRegressionModel;
  leftEyeBounds?: { xMin: number; xMax: number; yMin: number; yMax: number };
  rightEyeBounds?: { xMin: number; xMax: number; yMin: number; yMax: number };
}

export interface IModeCalibrationMapping {
  modeKey: CalibrationModeKey;
  calibrationPoints: ICalibrationPoint[];
  referenceValues: IReferenceValues;
  validationError?: IValidationError | null;
  lowConfidence?: boolean;
  calibratedAt: Date | string;
}

export interface IModeMappings {
  both?: IModeCalibrationMapping;
  left?: IModeCalibrationMapping;
  right?: IModeCalibrationMapping;
}

export interface ICalibration extends Document {
  userId: mongoose.Types.ObjectId;
  affectedEye: AffectedEye;
  practiceMode: PracticeMode;
  activeTrackingMode: CalibrationModeKey;
  modeMappings: IModeMappings;
  calibrationPoints: ICalibrationPoint[];
  referenceValues?: IReferenceValues | null;
  validationError?: IValidationError | null;
  lowConfidence?: boolean;
  calibrationStatus: 'completed' | 'incomplete' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const calibrationPointSchema = new Schema<ICalibrationPoint>(
  {
    id: { type: Number, required: true },
    label: { type: String, required: true },
    screenXNorm: { type: Number, required: true },
    screenYNorm: { type: Number, required: true },
    rawX: { type: Number, required: true },
    rawY: { type: Number, required: true },
    leftIrisX: { type: Number, required: true },
    leftIrisY: { type: Number, required: true },
    rightIrisX: { type: Number, required: true },
    rightIrisY: { type: Number, required: true },
    samplesCollected: { type: Number, required: true },
  },
  { _id: false }
);

const regressionModelSchema = new Schema<IRegressionModel>(
  {
    meanX: { type: Number, required: true },
    stdX: { type: Number, required: true },
    meanY: { type: Number, required: true },
    stdY: { type: Number, required: true },
    weightsX: { type: [Number], required: true },
    weightsY: { type: [Number], required: true },
    lambda: { type: Number, required: true },
  },
  { _id: false }
);

const validationErrorSchema = new Schema<IValidationError>(
  {
    meanErrorPx: { type: Number, required: true },
    meanErrorPct: { type: Number, required: true },
    maxErrorPx: { type: Number, required: true },
    thresholdPct: { type: Number, required: true },
    passed: { type: Boolean, required: true },
    pointsEvaluated: { type: Number, required: true },
    pointErrors: [
      {
        id: Number,
        label: String,
        errorPx: Number,
      },
    ],
  },
  { _id: false }
);

const referenceValuesSchema = new Schema<IReferenceValues>(
  {
    xMin: { type: Number, required: true },
    xMax: { type: Number, required: true },
    yMin: { type: Number, required: true },
    yMax: { type: Number, required: true },
    screenWidth: { type: Number, required: true },
    screenHeight: { type: Number, required: true },
    centerX: { type: Number, required: true },
    centerY: { type: Number, required: true },
    calibrationQuality: { type: Number, required: true },
    regressionModel: { type: regressionModelSchema, default: undefined },
    leftEyeBounds: {
      xMin: Number,
      xMax: Number,
      yMin: Number,
      yMax: Number,
    },
    rightEyeBounds: {
      xMin: Number,
      xMax: Number,
      yMin: Number,
      yMax: Number,
    },
  },
  { _id: false }
);

const modeCalibrationMappingSchema = new Schema<IModeCalibrationMapping>(
  {
    modeKey: { type: String, enum: ['both', 'left', 'right'], required: true },
    calibrationPoints: { type: [calibrationPointSchema], required: true },
    referenceValues: { type: referenceValuesSchema, required: true },
    validationError: { type: validationErrorSchema, default: null },
    lowConfidence: { type: Boolean, default: false },
    calibratedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const calibrationSchema = new Schema<ICalibration>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  affectedEye: {
    type: String,
    enum: ['left', 'right', 'not-sure'],
    default: 'not-sure',
  },
  practiceMode: {
    type: String,
    enum: ['affected-eye-only', 'both-eyes'],
    default: 'both-eyes',
  },
  activeTrackingMode: {
    type: String,
    enum: ['both', 'left', 'right'],
    default: 'both',
  },
  modeMappings: {
    both: { type: modeCalibrationMappingSchema, default: undefined },
    left: { type: modeCalibrationMappingSchema, default: undefined },
    right: { type: modeCalibrationMappingSchema, default: undefined },
  },
  calibrationPoints: { type: [calibrationPointSchema], default: [] },
  referenceValues: { type: referenceValuesSchema, default: null },
  validationError: { type: validationErrorSchema, default: null },
  lowConfidence: { type: Boolean, default: false },
  calibrationStatus: {
    type: String,
    enum: ['completed', 'incomplete', 'failed'],
    default: 'completed',
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const CalibrationModel =
  (mongoose.models.Calibration as mongoose.Model<ICalibration>) ||
  mongoose.model<ICalibration>('Calibration', calibrationSchema);
