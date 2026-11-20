import { create } from 'zustand';
import { calibrationApi } from '../services/api';
import type {
  AffectedEye,
  CalibrationRecord,
  EyeMode,
  InputMode,
  PracticeMode,
  ReferenceValues,
} from '../types';

export function resolveEyeMode(affectedEye: AffectedEye, practiceMode: PracticeMode): EyeMode {
  if (practiceMode === 'affected-eye-only') {
    if (affectedEye === 'left') return 'left';
    if (affectedEye === 'right') return 'right';
  }
  return 'both';
}

export function hasValidatedMappingForMode(
  calibration: CalibrationRecord | null,
  mode: EyeMode
): boolean {
  if (!calibration) return false;
  const mapping = calibration.modeMappings?.[mode];
  if (mapping?.referenceValues) {
    return mapping.validationError?.passed === true || mapping.lowConfidence === true;
  }
  return false;
}

export function getMappingReferenceForMode(
  calibration: CalibrationRecord | null,
  mode: EyeMode
): ReferenceValues | null {
  if (!calibration) return null;
  const mapping = calibration.modeMappings?.[mode];
  if (
    mapping?.referenceValues &&
    (mapping.validationError?.passed === true || mapping.lowConfidence === true)
  ) {
    return mapping.referenceValues;
  }
  // Backward compatibility for legacy records saved before modeMappings existed
  if (
    !calibration.modeMappings &&
    calibration.calibrationStatus === 'completed' &&
    calibration.referenceValues &&
    (calibration.activeTrackingMode || 'both') === mode
  ) {
    return calibration.referenceValues;
  }
  return null;
}

interface GazeStoreState {
  calibration: CalibrationRecord | null;
  calibrationLoaded: boolean;
  affectedEye: AffectedEye;
  practiceMode: PracticeMode;
  inputMode: InputMode;
  activeEyeMode: EyeMode;
  selectedCameraId: string;
  loadCalibration: () => Promise<void>;
  setCalibration: (calibration: CalibrationRecord | null) => void;
  updateCalibrationMode: (
    affectedEye: AffectedEye,
    practiceMode: PracticeMode
  ) => Promise<{ calibration: CalibrationRecord; requiresCalibration: boolean }>;
  resetCalibration: () => Promise<void>;
  setInputMode: (mode: InputMode) => void;
  setActiveEyeMode: (eyeMode: EyeMode) => void;
  setSelectedCameraId: (deviceId: string) => void;
}

export const useGazeStore = create<GazeStoreState>((set) => ({
  calibration: null,
  calibrationLoaded: false,
  affectedEye: 'not-sure',
  practiceMode: 'both-eyes',
  inputMode: 'webcam',
  activeEyeMode: 'both',
  selectedCameraId: '',

  loadCalibration: async () => {
    try {
      const { calibration } = await calibrationApi.getLatest();
      if (calibration) {
        const affectedEye = calibration.affectedEye || 'not-sure';
        const practiceMode = calibration.practiceMode || 'both-eyes';
        const activeEyeMode =
          calibration.activeTrackingMode || resolveEyeMode(affectedEye, practiceMode);
        set({
          calibration,
          calibrationLoaded: true,
          affectedEye,
          practiceMode,
          activeEyeMode,
        });
      } else {
        set({ calibration: null, calibrationLoaded: true });
      }
    } catch {
      set({ calibrationLoaded: true });
    }
  },

  setCalibration: (calibration) => {
    if (calibration) {
      const affectedEye = calibration.affectedEye || 'not-sure';
      const practiceMode = calibration.practiceMode || 'both-eyes';
      const activeEyeMode =
        calibration.activeTrackingMode || resolveEyeMode(affectedEye, practiceMode);
      set({
        calibration,
        calibrationLoaded: true,
        affectedEye,
        practiceMode,
        activeEyeMode,
      });
    } else {
      set({
        calibration: null,
        calibrationLoaded: true,
      });
    }
  },

  updateCalibrationMode: async (affectedEye, practiceMode) => {
    const res = await calibrationApi.updateMode({ affectedEye, practiceMode });
    const activeEyeMode =
      res.calibration.activeTrackingMode || resolveEyeMode(affectedEye, practiceMode);
    set({
      calibration: res.calibration,
      calibrationLoaded: true,
      affectedEye: res.calibration.affectedEye,
      practiceMode: res.calibration.practiceMode,
      activeEyeMode,
    });
    return {
      calibration: res.calibration,
      requiresCalibration: res.requiresCalibration,
    };
  },

  resetCalibration: async () => {
    await calibrationApi.reset();
    set({
      calibration: null,
      affectedEye: 'not-sure',
      practiceMode: 'both-eyes',
      activeEyeMode: 'both',
    });
  },

  setInputMode: (inputMode) => set({ inputMode }),
  setActiveEyeMode: (activeEyeMode) => set({ activeEyeMode }),
  setSelectedCameraId: (selectedCameraId) => set({ selectedCameraId }),
}));
