import React, { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Crosshair, Play, Info } from 'lucide-react';
import { useGazeTracker } from '../hooks/useGazeTracker';
import { getMappingReferenceForMode, useGazeStore } from '../store/useGazeStore';
import { useAuthStore } from '../store/useAuthStore';
import { WebcamPreview } from '../components/WebcamPreview';
import { GazeIndicator } from '../components/GazeIndicator';
import { EyeDebugPanel } from '../components/EyeDebugPanel';
import { DEFAULT_REFERENCE_VALUES, projectGazeToContainer } from '../utils/cv/gazeEstimator';
import type { EyeMode, GazeStatus } from '../types';

const QUADRANTS = [
  { id: 'tl', label: 'Upper Left', match: (x: number, y: number) => x < 0.5 && y < 0.5 },
  { id: 'tr', label: 'Upper Right', match: (x: number, y: number) => x >= 0.5 && y < 0.5 },
  { id: 'bl', label: 'Lower Left', match: (x: number, y: number) => x < 0.5 && y >= 0.5 },
  { id: 'br', label: 'Lower Right', match: (x: number, y: number) => x >= 0.5 && y >= 0.5 },
];

function getStatusBadge(status: GazeStatus): { label: string; textClass: string; dotClass: string } {
  if (status === 'ok') {
    return { label: 'Tracking OK', textClass: 'text-[#238858]', dotClass: 'bg-[#35B779]' };
  }
  if (status === 'off-screen') {
    return { label: 'Off-screen', textClass: 'text-[#A87518]', dotClass: 'bg-[#F2B84B]' };
  }
  return { label: 'Face lost', textClass: 'text-[#C24550]', dotClass: 'bg-[#E76B75]' };
}

export const GazeTrackingPage: React.FC = () => {
  const { user } = useAuthStore();
  const { calibration, activeEyeMode, setActiveEyeMode, selectedCameraId } = useGazeStore();
  const stageRef = useRef<HTMLDivElement | null>(null);

  const modeReferenceValues = getMappingReferenceForMode(calibration, activeEyeMode);

  const {
    videoRef,
    overlayCanvasRef,
    cameraStatus,
    errorMessage,
    faceDetected,
    gazePoint,
    eyeSample,
    frameQuality,
    startCamera,
    stopCamera,
  } = useGazeTracker({
    referenceValues: modeReferenceValues,
    eyeMode: activeEyeMode,
    preferredDeviceId: selectedCameraId || user?.preferences?.preferredCameraId,
    autoStart: false,
  });

  const activeRef = modeReferenceValues || DEFAULT_REFERENCE_VALUES;

  const projectedStage = useMemo(() => {
    const rect = stageRef.current?.getBoundingClientRect() || {
      left: 0,
      top: 0,
      width: 640,
      height: 360,
    };
    return projectGazeToContainer(cameraStatus === 'ready' ? gazePoint : null, rect);
  }, [cameraStatus, gazePoint]);

  const activeQuadrant = useMemo(() => {
    if (!projectedStage.valid || !projectedStage.inBounds) return null;
    return (
      QUADRANTS.find((q) =>
        q.match(projectedStage.containerXNorm, projectedStage.containerYNorm)
      )?.id || null
    );
  }, [projectedStage]);

  const statusMeta = getStatusBadge(
    cameraStatus === 'ready' ? projectedStage.gazeStatus : 'face-lost'
  );

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <section className="rounded-2xl border border-[#E6E3FA] bg-white p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#6554E8]">Real-Time MediaPipe Iris Tracking</p>
          <h2 className="mt-1 font-display text-xl sm:text-2xl font-bold text-[#25234A]">
            Gaze Tracking Verification
          </h2>
          <p className="mt-1 text-sm text-[#5C597E] max-w-2xl">
            Inspect live unclamped gaze coordinates, out-of-bounds detection, and how your gaze
            indicator responds across four screen regions before starting training games.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F7F6FF] border border-[#E6E3FA]">
            {(['both', 'left', 'right'] as EyeMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setActiveEyeMode(mode)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors capitalize whitespace-nowrap ${
                  activeEyeMode === mode
                    ? 'bg-white text-[#6554E8] shadow-xs'
                    : 'text-[#5C597E] hover:text-[#25234A]'
                }`}
              >
                {mode === 'both' ? 'Both Eyes' : `${mode} Eye`}
              </button>
            ))}
          </div>

          {cameraStatus === 'ready' ? (
            <button
              type="button"
              onClick={stopCamera}
              className="rounded-lg border border-[#E6E3FA] px-4 py-2 text-xs font-semibold text-[#5C597E] hover:bg-[#F7F6FF] whitespace-nowrap"
            >
              Stop Tracking
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startCamera()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5342D6] whitespace-nowrap"
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
              Start Live Tracking
            </button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Gaze Test Stage */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-2xl border border-[#E6E3FA] bg-white overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E6E3FA] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-[#25234A]">Interactive Gaze Field</span>
                <span aria-hidden="true" className="text-[#5C597E]">
                  ·
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <span className={`w-2 h-2 rounded-full ${statusMeta.dotClass}`} />
                  <span className={statusMeta.textClass}>{statusMeta.label}</span>
                </span>
                {cameraStatus === 'ready' && !projectedStage.valid && activeEyeMode !== 'both' && (
                  <span className="text-[#C24550] font-medium">
                    Keep your {activeEyeMode} eye open and visible.
                  </span>
                )}
              </div>
              <span className="text-[#5C597E]">
                {modeReferenceValues
                  ? `Using saved calibration for ${
                      activeEyeMode === 'both' ? 'Both Eyes' : `${activeEyeMode} Eye`
                    }`
                  : `No saved calibration for ${
                      activeEyeMode === 'both' ? 'Both Eyes' : `${activeEyeMode} Eye`
                    } — calibrate first`}
              </span>
            </div>

            {activeEyeMode !== 'both' && (
              <div className="px-5 py-2.5 bg-[#F7F6FF] border-b border-[#E6E3FA] text-xs text-[#5C597E]">
                <strong className="text-[#25234A]">
                  Single-eye mode ({activeEyeMode === 'left' ? 'Left' : 'Right'} eye):
                </strong>{' '}
                Use an eye patch or cover the other eye. Closing it by squeezing can distort
                tracking.
              </div>
            )}

            <div
              ref={stageRef}
              className="relative h-[360px] sm:h-[400px] bg-[#F7F6FF] grid grid-cols-2 grid-rows-2 overflow-hidden"
            >
              {QUADRANTS.map((q) => {
                const isFocused = activeQuadrant === q.id;
                return (
                  <div
                    key={q.id}
                    className={`border border-[#E6E3FA]/80 flex flex-col items-center justify-center p-4 transition-colors duration-150 ${
                      isFocused ? 'bg-[#6554E8]/10' : 'bg-transparent'
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full mb-2 transition-colors ${
                        isFocused ? 'bg-[#6554E8]' : 'bg-[#A99BF7]/60'
                      }`}
                    />
                    <span
                      className={`text-xs font-semibold ${
                        isFocused ? 'text-[#6554E8]' : 'text-[#5C597E]'
                      }`}
                    >
                      {q.label}
                    </span>
                    {isFocused && (
                      <span className="mt-1 text-[11px] font-medium text-[#238858]">
                        Gaze in bounds
                      </span>
                    )}
                  </div>
                );
              })}

              <GazeIndicator
                x={projectedStage.clampedContainerX}
                y={projectedStage.clampedContainerY}
                visible={cameraStatus === 'ready' && projectedStage.valid}
                locked={Boolean(activeQuadrant)}
                offScreen={!projectedStage.inBounds}
                label={
                  gazePoint && projectedStage.valid
                    ? projectedStage.inBounds
                      ? `${Math.round(projectedStage.containerX)}, ${Math.round(projectedStage.containerY)}`
                      : 'Off-screen'
                    : undefined
                }
              />

              {cameraStatus !== 'ready' && (
                <div className="absolute inset-0 bg-[#F7F6FF]/85 flex flex-col items-center justify-center p-6 text-center">
                  <p className="font-display text-sm font-bold text-[#25234A]">
                    Start live webcam tracking to see your visual gaze indicator
                  </p>
                  <p className="mt-1 text-xs text-[#5C597E] max-w-sm">
                    Look toward each region or look off-screen to verify bounds gating and unclamped
                    gaze coordinate mapping.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Normalization & Bounds Telemetry Readout */}
          <div className="rounded-2xl border border-[#E6E3FA] bg-white p-5">
            <h3 className="font-display text-sm font-bold text-[#25234A]">
              Live Gaze Mapping & Bounds Pipeline
            </h3>
            <p className="mt-1 text-xs text-[#5C597E]">
              Unclamped coordinates are mapped via ridge polynomial regression and checked against
              calibrated iris bounds, head pose, and this container&apos;s bounding box.
            </p>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
              <div className="rounded-xl bg-[#F7F6FF] p-3 border border-[#E6E3FA]/70">
                <span className="font-sans text-[11px] text-[#5C597E] block">Raw Iris (X, Y)</span>
                <strong className="mt-1 block text-[#25234A]">
                  {eyeSample && faceDetected
                    ? `${eyeSample.rawX.toFixed(3)}, ${eyeSample.rawY.toFixed(3)}`
                    : '—'}
                </strong>
              </div>
              <div className="rounded-xl bg-[#F7F6FF] p-3 border border-[#E6E3FA]/70">
                <span className="font-sans text-[11px] text-[#5C597E] block">
                  Unclamped Container
                </span>
                <strong className="mt-1 block text-[#6554E8]">
                  {projectedStage.valid
                    ? `${Math.round(projectedStage.containerX)}px, ${Math.round(
                        projectedStage.containerY
                      )}px`
                    : '—'}
                </strong>
              </div>
              <div className="rounded-xl bg-[#F7F6FF] p-3 border border-[#E6E3FA]/70">
                <span className="font-sans text-[11px] text-[#5C597E] block">
                  Confidence / Bounds
                </span>
                <strong className={`mt-1 block ${statusMeta.textClass}`}>
                  {cameraStatus === 'ready'
                    ? `${Math.round(projectedStage.confidence * 100)}% · ${
                        projectedStage.inBounds ? 'In' : 'Out'
                      }`
                    : '—'}
                </strong>
              </div>
              <div className="rounded-xl bg-[#F7F6FF] p-3 border border-[#E6E3FA]/70">
                <span className="font-sans text-[11px] text-[#5C597E] block">Iris Cal Range</span>
                <strong className="mt-1 block text-[#5C597E]">
                  {activeRef.xMin.toFixed(2)}–{activeRef.xMax.toFixed(2)}
                </strong>
              </div>
            </div>
          </div>

          <EyeDebugPanel
            eyeSample={eyeSample}
            eyeMode={activeEyeMode}
            faceDetected={faceDetected}
            frameQuality={frameQuality}
            activeGateFailure={
              cameraStatus !== 'ready'
                ? null
                : !faceDetected || !eyeSample
                  ? 'Face not detected'
                  : !eyeSample.valid
                    ? activeEyeMode === 'both'
                      ? !eyeSample.leftEye.valid && !eyeSample.rightEye.valid
                        ? 'Both eyes invalid'
                        : !eyeSample.leftEye.valid
                          ? 'Left eye invalid'
                          : 'Right eye invalid'
                      : `Keep your ${activeEyeMode} eye open and visible.`
                    : eyeSample.isBlinking && activeEyeMode !== 'both'
                      ? `Keep your ${activeEyeMode} eye open and visible.`
                      : !eyeSample.faceInFrame
                        ? 'Face clipped by camera edge'
                        : !eyeSample.headPoseOk
                          ? `Head pose out of range (yaw ${Math.round(eyeSample.yawDeg)}°, pitch ${Math.round(eyeSample.pitchDeg)}°)`
                          : frameQuality && !frameQuality.brightnessOk
                            ? 'Lighting outside acceptable range'
                            : null
            }
          />
        </div>

        {/* Right Column: Webcam Feed + Honesty Disclaimer + Next Steps */}
        <div className="lg:col-span-5 space-y-5">
          <WebcamPreview
            videoRef={videoRef}
            overlayCanvasRef={overlayCanvasRef}
            cameraStatus={cameraStatus}
            faceDetected={faceDetected}
            frameQuality={frameQuality}
            errorMessage={errorMessage}
            onStartCamera={() => void startCamera()}
          />

          <div className="rounded-2xl border border-[#E6E3FA] bg-white p-5 space-y-4">
            <div className="flex items-start gap-2.5 text-xs text-[#5C597E]">
              <Info className="w-4 h-4 text-[#6554E8] shrink-0 mt-0.5" aria-hidden="true" />
              <p className="leading-relaxed">
                <strong className="text-[#25234A]">Accuracy note:</strong> Standard webcam iris
                tracking estimates screen gaze region using facial landmarks and calibration bounds.
                It provides interactive feedback for visual exercises and is not clinical-grade
                infrared eye tracking.
              </p>
            </div>

            <div className="pt-3 border-t border-[#E6E3FA] flex flex-wrap gap-3">
              <Link
                to="/calibration"
                className="inline-flex items-center gap-2 rounded-lg border border-[#E6E3FA] px-4 py-2 text-xs font-semibold text-[#25234A] hover:bg-[#F7F6FF]"
              >
                <Crosshair className="w-3.5 h-3.5 text-[#6554E8]" />
                {calibration ? 'Recalibrate' : 'Run Calibration'}
              </Link>
              <Link
                to="/training"
                className="inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5342D6]"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Start Training Games
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
