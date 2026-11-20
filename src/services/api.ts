import axios from 'axios';
import type {
  AffectedEye,
  AnalyticsOverview,
  CalibrationPointData,
  CalibrationRecord,
  DifficultyAdjustment,
  DifficultyLevel,
  DifficultyParams,
  EyeMode,
  GameType,
  InputMode,
  PracticeMode,
  ReferenceValues,
  TrainingSession,
  User,
  UserPreferences,
  UserProgress,
  ValidationError,
} from '../types';

const FALLBACK_TOKEN_KEY = 'amblyocare_session_token';

export function setFallbackToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(FALLBACK_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(FALLBACK_TOKEN_KEY);
    }
  } catch {
    // Ignore storage quota / privacy errors
  }
}

export function getFallbackToken(): string | null {
  try {
    return sessionStorage.getItem(FALLBACK_TOKEN_KEY);
  } catch {
    return null;
  }
}

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = getFallbackToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function extractApiError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export const authApi = {
  async register(payload: { name: string; email: string; password: string }) {
    const { data } = await apiClient.post<{ user: User; token?: string; message: string }>(
      '/auth/register',
      payload
    );
    if (data.token) setFallbackToken(data.token);
    return data;
  },

  async login(payload: { email: string; password: string }) {
    const { data } = await apiClient.post<{ user: User; token?: string; message: string }>(
      '/auth/login',
      payload
    );
    if (data.token) setFallbackToken(data.token);
    return data;
  },

  async logout() {
    setFallbackToken(null);
    const { data } = await apiClient.post<{ message: string }>('/auth/logout');
    return data;
  },

  async me() {
    const { data } = await apiClient.get<{ user: User }>('/auth/me');
    return data;
  },

  async forgotPassword(email: string) {
    const { data } = await apiClient.post<{
      message: string;
      resetAvailable: boolean;
      devResetCode?: string;
    }>('/auth/forgot-password', { email });
    return data;
  },

  async resetPassword(payload: { email: string; resetCode: string; newPassword: string }) {
    const { data } = await apiClient.post<{ message: string }>('/auth/reset-password', payload);
    return data;
  },
};

export const userApi = {
  async getProfile() {
    const { data } = await apiClient.get<{
      user: User;
      calibration: CalibrationRecord | null;
      progress: UserProgress;
    }>('/users/profile');
    return data;
  },

  async updateProfile(payload: Partial<{ name: string; email: string; profileImage: string }>) {
    const { data } = await apiClient.put<{ user: User; message: string }>('/users/profile', payload);
    return data;
  },

  async updatePreferences(payload: Partial<UserPreferences>) {
    const { data } = await apiClient.put<{
      user: User;
      progress: UserProgress;
      message: string;
    }>('/users/preferences', payload);
    return data;
  },
};

export const calibrationApi = {
  async save(payload: {
    affectedEye: AffectedEye;
    practiceMode: PracticeMode;
    calibrationPoints: CalibrationPointData[];
    referenceValues: ReferenceValues;
    validationError?: ValidationError | null;
    lowConfidence?: boolean;
    calibrationStatus: 'completed' | 'incomplete' | 'failed';
  }) {
    const { data } = await apiClient.post<{ calibration: CalibrationRecord; message: string }>(
      '/calibration',
      payload
    );
    return data;
  },

  async updateMode(payload: { affectedEye: AffectedEye; practiceMode: PracticeMode }) {
    const { data } = await apiClient.put<{
      calibration: CalibrationRecord;
      requiresCalibration: boolean;
      message: string;
    }>('/calibration/mode', payload);
    return data;
  },

  async getLatest() {
    const { data } = await apiClient.get<{ calibration: CalibrationRecord | null }>(
      '/calibration/latest'
    );
    return data;
  },

  async reset() {
    const { data } = await apiClient.delete<{ message: string }>('/calibration/reset');
    return data;
  },
};

export const trainingApi = {
  async createSession(payload: {
    gameType: GameType;
    difficultyLevel: DifficultyLevel;
    difficultyParams: DifficultyParams;
    eyeMode: EyeMode;
    inputMode: InputMode;
    totalTargets: number;
    targetsHit: number;
    targetsMissed: number;
    averageReactionTime: number;
    score: number;
    sessionDuration: number;
    offScreenTime?: number;
    invalidSampleCount?: number;
  }) {
    const { data } = await apiClient.post<{
      session: TrainingSession;
      progress: UserProgress;
      difficultyAdjustment: DifficultyAdjustment;
      message: string;
    }>('/training/sessions', payload);
    return data;
  },

  async getSessions(params?: { range?: string; gameType?: string; limit?: number }) {
    const { data } = await apiClient.get<{ sessions: TrainingSession[] }>('/training/sessions', {
      params,
    });
    return data;
  },

  async getSessionById(id: string) {
    const { data } = await apiClient.get<{ session: TrainingSession }>(`/training/sessions/${id}`);
    return data;
  },

  async getAdaptiveState() {
    const { data } = await apiClient.get<{
      adaptiveEnabled: boolean;
      currentDifficultyLevel: DifficultyLevel;
      adaptiveParams: DifficultyParams;
      lastAdjustmentNote: string;
      limits: Record<string, { min: number; max: number }>;
    }>('/training/adaptive');
    return data;
  },

  async setDifficultyLevel(level: DifficultyLevel) {
    const { data } = await apiClient.put<{ progress: UserProgress; message: string }>(
      '/training/adaptive/level',
      { level }
    );
    return data;
  },
};

export const analyticsApi = {
  async getOverview(params?: { range?: string; gameType?: string }) {
    const { data } = await apiClient.get<AnalyticsOverview>('/analytics/overview', { params });
    return data;
  },
};
