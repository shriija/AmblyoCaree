import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  Upload,
  RotateCcw,
  LogOut,
  Crosshair,
  Camera,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useGazeStore } from '../store/useGazeStore';
import type { DifficultyLevel, EyeMode } from '../types';

interface CameraOption {
  deviceId: string;
  label: string;
}

export const ProfileSettingsPage: React.FC = () => {
  const { user, updateProfile, updatePreferences, logout, loading, error, clearError } =
    useAuthStore();
  const { calibration, resetCalibration, setActiveEyeMode, setSelectedCameraId } = useGazeStore();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profileImage, setProfileImage] = useState(user?.profileImage || '');

  const [preferredCameraId, setPreferredCameraId] = useState(
    user?.preferences?.preferredCameraId || ''
  );
  const [targetEye, setTargetEye] = useState<EyeMode>(user?.preferences?.targetEye || 'both');
  const [adaptiveEnabled, setAdaptiveEnabled] = useState<boolean>(
    user?.preferences?.adaptiveEnabled ?? true
  );
  const [preferredDifficulty, setPreferredDifficulty] = useState<DifficultyLevel>(
    user?.preferences?.preferredDifficulty || 'beginner'
  );
  const [showGazeIndicator, setShowGazeIndicator] = useState<boolean>(
    user?.preferences?.showGazeIndicator ?? true
  );
  const [sessionDurationSec, setSessionDurationSec] = useState<number>(
    user?.preferences?.sessionDurationSec || 45
  );

  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);
  const [prefsFeedback, setPrefsFeedback] = useState<string | null>(null);
  const [calFeedback, setCalFeedback] = useState<string | null>(null);
  const [resettingCal, setResettingCal] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setProfileImage(user.profileImage || '');
      setPreferredCameraId(user.preferences?.preferredCameraId || '');
      setTargetEye(user.preferences?.targetEye || 'both');
      setAdaptiveEnabled(user.preferences?.adaptiveEnabled ?? true);
      setPreferredDifficulty(user.preferences?.preferredDifficulty || 'beginner');
      setShowGazeIndicator(user.preferences?.showGazeIndicator ?? true);
      setSessionDurationSec(user.preferences?.sessionDurationSec || 45);
    }
  }, [user]);

  const scanCameras = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Webcam ${idx + 1}`,
        }));
      setCameras(videoInputs);
    } catch {
      // Ignore if permission hasn't been granted yet
    }
  };

  useEffect(() => {
    void scanCameras();
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileFeedback('Please select a valid image file (PNG, JPG, or WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Resize smoothly to 160x160 JPEG so database payload stays small
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 160;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 160, 160);
        setProfileImage(canvas.toDataURL('image/jpeg', 0.82));
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setProfileFeedback(null);
    const ok = await updateProfile({ name: name.trim(), email: email.trim(), profileImage });
    if (ok) {
      setProfileFeedback('Profile details saved successfully.');
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setPrefsFeedback(null);
    const ok = await updatePreferences({
      preferredCameraId,
      targetEye,
      adaptiveEnabled,
      preferredDifficulty,
      showGazeIndicator,
      sessionDurationSec,
    });
    if (ok) {
      setActiveEyeMode(targetEye);
      setSelectedCameraId(preferredCameraId);
      setPrefsFeedback('Training, camera, and adaptive difficulty preferences saved.');
    }
  };

  const handleResetCalibration = async () => {
    setResettingCal(true);
    setCalFeedback(null);
    try {
      await resetCalibration();
      setCalFeedback('Your saved calibration profile has been cleared.');
    } catch {
      setCalFeedback('Could not reset calibration right now.');
    } finally {
      setResettingCal(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials =
    name
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'AC';

  return (
    <div className="space-y-6 max-w-4xl">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#E76B75]/40 bg-[#FFF5F6] px-4 py-3 text-xs text-[#A3303B] flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Account Profile Section */}
      <section className="rounded-2xl border border-[#E6E3FA] bg-white p-6">
        <h2 className="font-display text-base font-bold text-[#25234A]">Account Profile</h2>
        <p className="text-xs text-[#5C597E] mt-0.5">
          Update your display name, email address, and profile avatar.
        </p>

        <form onSubmit={handleSaveProfile} className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center gap-4">
            {profileImage ? (
              <img
                src={profileImage}
                alt={name || 'User profile'}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-full object-cover border border-[#E6E3FA]"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#F0EDFF] text-[#6554E8] font-display text-lg font-bold flex items-center justify-center">
                {initials}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-[#E6E3FA] bg-white px-3.5 py-2 text-xs font-semibold text-[#25234A] hover:bg-[#F7F6FF]">
                <Upload className="w-3.5 h-3.5 text-[#6554E8]" />
                Upload Photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="sr-only"
                />
              </label>
              {profileImage && (
                <button
                  type="button"
                  onClick={() => setProfileImage('')}
                  className="rounded-lg px-3 py-2 text-xs font-medium text-[#5C597E] hover:text-[#C24550]"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="profile-name" className="block text-xs font-semibold text-[#25234A]">
                Full name
              </label>
              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1.5 w-full rounded-lg border border-[#E6E3FA] bg-white px-3.5 py-2.5 text-sm text-[#25234A] focus:border-[#6554E8] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="profile-email" className="block text-xs font-semibold text-[#25234A]">
                Email address
              </label>
              <input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1.5 w-full rounded-lg border border-[#E6E3FA] bg-white px-3.5 py-2.5 text-sm text-[#25234A] focus:border-[#6554E8] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {profileFeedback ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#238858]">
                <CheckCircle2 className="w-4 h-4" />
                {profileFeedback}
              </span>
            ) : (
              <span />
            )}

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#6554E8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5342D6] disabled:opacity-60"
            >
              {loading ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </section>

      {/* Camera, Training & Adaptive Difficulty Preferences */}
      <section className="rounded-2xl border border-[#E6E3FA] bg-white p-6">
        <h2 className="font-display text-base font-bold text-[#25234A]">
          Camera, Training & Adaptive Difficulty Settings
        </h2>
        <p className="text-xs text-[#5C597E] mt-0.5">
          Customize your preferred webcam, default eye mode, session length, and automatic
          difficulty progression.
        </p>

        <form onSubmit={handleSavePreferences} className="mt-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="camera-select"
                className="block text-xs font-semibold text-[#25234A]"
              >
                Preferred Webcam
              </label>
              <div className="mt-1.5 flex gap-2">
                <select
                  id="camera-select"
                  value={preferredCameraId}
                  onChange={(e) => setPreferredCameraId(e.target.value)}
                  className="flex-1 rounded-lg border border-[#E6E3FA] bg-white px-3 py-2.5 text-sm text-[#25234A] focus:border-[#6554E8] focus:outline-none"
                >
                  <option value="">System Default Camera</option>
                  {cameras.map((cam) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void scanCameras()}
                  aria-label="Refresh connected cameras"
                  className="rounded-lg border border-[#E6E3FA] px-3 py-2 text-xs text-[#5C597E] hover:bg-[#F7F6FF]"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="eye-mode" className="block text-xs font-semibold text-[#25234A]">
                Default Eye Focus Mode
              </label>
              <select
                id="eye-mode"
                value={targetEye}
                onChange={(e) => setTargetEye(e.target.value as EyeMode)}
                className="mt-1.5 w-full rounded-lg border border-[#E6E3FA] bg-white px-3 py-2.5 text-sm text-[#25234A] focus:border-[#6554E8] focus:outline-none"
              >
                <option value="both">Both Eyes (Binocular)</option>
                <option value="left">Left Eye Focus</option>
                <option value="right">Right Eye Focus</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="difficulty-level"
                className="block text-xs font-semibold text-[#25234A]"
              >
                Baseline Difficulty Level
              </label>
              <select
                id="difficulty-level"
                value={preferredDifficulty}
                onChange={(e) => setPreferredDifficulty(e.target.value as DifficultyLevel)}
                className="mt-1.5 w-full rounded-lg border border-[#E6E3FA] bg-white px-3 py-2.5 text-sm text-[#25234A] focus:border-[#6554E8] focus:outline-none"
              >
                <option value="beginner">Beginner (Larger targets, generous window)</option>
                <option value="intermediate">Intermediate (Balanced size & speed)</option>
                <option value="advanced">Advanced (Smaller targets, faster pacing)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="session-duration"
                className="block text-xs font-semibold text-[#25234A]"
              >
                Session Duration ({sessionDurationSec} seconds)
              </label>
              <input
                id="session-duration"
                type="range"
                min={20}
                max={120}
                step={5}
                value={sessionDurationSec}
                onChange={(e) => setSessionDurationSec(Number(e.target.value))}
                className="mt-3 w-full accent-[#6554E8]"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={adaptiveEnabled}
                onChange={(e) => setAdaptiveEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[#E6E3FA] accent-[#6554E8]"
              />
              <span className="text-xs text-[#5C597E]">
                <strong className="text-[#25234A] block">
                  Enable Automatic Adaptive Difficulty
                </strong>
                Gradually adjust target size, speed, spacing, and allowed response time after each
                completed session within safe minimum and maximum bounds.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={showGazeIndicator}
                onChange={(e) => setShowGazeIndicator(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[#E6E3FA] accent-[#6554E8]"
              />
              <span className="text-xs text-[#5C597E]">
                <strong className="text-[#25234A] block">Show On-Screen Gaze Indicator</strong>
                Display the subtle real-time reticle showing estimated gaze coordinates during
                training games.
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {prefsFeedback ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#238858]">
                <CheckCircle2 className="w-4 h-4" />
                {prefsFeedback}
              </span>
            ) : (
              <span />
            )}

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#6554E8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5342D6] disabled:opacity-60"
            >
              {loading ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>
      </section>

      {/* Calibration Management + Sign Out */}
      <section className="rounded-2xl border border-[#E6E3FA] bg-white p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-[#25234A]">
              Eye Calibration Data
            </h2>
            <p className="text-xs text-[#5C597E] mt-0.5">
              {calibration
                ? `Last calibrated on ${new Date(calibration.createdAt).toLocaleString()} (${calibration.calibrationPoints.length} reference points).`
                : 'No calibration profile currently saved.'}
            </p>
            {calFeedback && <p className="mt-1.5 text-xs text-[#238858]">{calFeedback}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              to="/calibration"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E6E3FA] px-3.5 py-2 text-xs font-semibold text-[#25234A] hover:bg-[#F7F6FF]"
            >
              <Crosshair className="w-3.5 h-3.5 text-[#6554E8]" />
              Run Calibration
            </Link>
            <button
              type="button"
              disabled={!calibration || resettingCal}
              onClick={() => void handleResetCalibration()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E76B75]/40 px-3.5 py-2 text-xs font-semibold text-[#C24550] hover:bg-[#FFF5F6] disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {resettingCal ? 'Resetting...' : 'Reset Calibration'}
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-[#E6E3FA] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-[#5C597E]">
            Sign out of your AmblyoCare session on this device.
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="inline-flex items-center gap-2 rounded-lg border border-[#E6E3FA] px-4 py-2 text-xs font-semibold text-[#25234A] hover:bg-[#F7F6FF] whitespace-nowrap self-start sm:self-auto"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </section>
    </div>
  );
};
