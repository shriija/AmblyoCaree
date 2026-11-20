import { create } from 'zustand';
import { authApi, extractApiError, userApi } from '../services/api';
import type { User, UserPreferences } from '../types';

interface AuthState {
  user: User | null;
  initialized: boolean;
  loading: boolean;
  error: string | null;
  checkAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (payload: Partial<{ name: string; email: string; profileImage: string }>) => Promise<boolean>;
  updatePreferences: (payload: Partial<UserPreferences>) => Promise<boolean>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initialized: false,
  loading: false,
  error: null,

  checkAuth: async () => {
    try {
      const { user } = await authApi.me();
      set({ user, initialized: true, error: null });
    } catch {
      set({ user: null, initialized: true });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { user } = await authApi.login({ email, password });
      set({ user, loading: false, initialized: true, error: null });
      return true;
    } catch (error) {
      set({ loading: false, error: extractApiError(error, 'Unable to sign in.') });
      return false;
    }
  },

  register: async (name, email, password) => {
    set({ loading: true, error: null });
    try {
      const { user } = await authApi.register({ name, email, password });
      set({ user, loading: false, initialized: true, error: null });
      return true;
    } catch (error) {
      set({ loading: false, error: extractApiError(error, 'Unable to create account.') });
      return false;
    }
  },

  logout: async () => {
    set({ loading: true });
    try {
      await authApi.logout();
    } catch {
      // Clear local state regardless of network result
    }
    set({ user: null, loading: false, error: null });
  },

  updateProfile: async (payload) => {
    set({ loading: true, error: null });
    try {
      const { user } = await userApi.updateProfile(payload);
      set({ user, loading: false });
      return true;
    } catch (error) {
      set({ loading: false, error: extractApiError(error, 'Unable to update profile.') });
      return false;
    }
  },

  updatePreferences: async (payload) => {
    set({ loading: true, error: null });
    try {
      const { user } = await userApi.updatePreferences(payload);
      set({ user, loading: false });
      return true;
    } catch (error) {
      set({ loading: false, error: extractApiError(error, 'Unable to save settings.') });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
