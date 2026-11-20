import React from 'react';
import { Camera, CameraOff, AlertTriangle, CheckCircle2, Sun } from 'lucide-react';
import type { CameraStatus } from '../hooks/useGazeTracker';
import type { FrameQualityMetrics } from '../utils/cv/imageProcessing';

interface WebcamPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraStatus: CameraStatus;
  faceDetected: boolean;
  frameQuality: FrameQualityMetrics | null;
  errorMessage: string | null;
  compact?: boolean;
  onStartCamera?: () => void;
}

export const WebcamPreview: React.FC<WebcamPreviewProps> = ({
  videoRef,
  overlayCanvasRef,
  cameraStatus,
  faceDetected,
  frameQuality,
  errorMessage,
  compact = false,
  onStartCamera,
}) => {
  const isActive = cameraStatus === 'ready' || cameraStatus === 'loading-model';

  return (
    <div className="rounded-xl border border-[#E6E3FA] bg-white overflow-hidden">
      <div
        className={`relative bg-[#1A1835] ${
          compact ? 'aspect-[4/3] max-h-48' : 'aspect-[4/3]'
        } w-full overflow-hidden`}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className={`w-full h-full object-cover -scale-x-100 ${isActive ? 'opacity-100' : 'opacity-0'}`}
        />
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />

        {!isActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center text-white">
            {cameraStatus === 'requesting' ? (
              <>
                <div className="w-7 h-7 border-2 border-[#A99BF7] border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm font-medium">Requesting webcam permission...</p>
                <p className="mt-1 text-xs text-white/75 max-w-xs">
                  Please choose Allow in your browser prompt to enable eye landmark tracking.
                </p>
              </>
            ) : (
              <>
                <CameraOff className="w-8 h-8 text-[#A99BF7] mb-2.5" aria-hidden="true" />
                <p className="text-sm font-medium">
                  {cameraStatus === 'denied'
                    ? 'Camera Permission Denied'
                    : cameraStatus === 'error'
                      ? 'Camera Unavailable'
                      : 'Webcam Preview Off'}
                </p>
                {errorMessage ? (
                  <p className="mt-1.5 text-xs text-white/80 max-w-xs leading-relaxed">
                    {errorMessage}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-white/75 max-w-xs">
                    Start your webcam to detect eye and iris landmarks in real time.
                  </p>
                )}
                {onStartCamera && (
                  <button
                    type="button"
                    onClick={onStartCamera}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5342D6] transition-colors whitespace-nowrap"
                  >
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                    Enable Webcam
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {cameraStatus === 'loading-model' && (
          <div className="absolute inset-0 bg-[#1A1835]/75 flex flex-col items-center justify-center p-4 text-center text-white">
            <div className="w-7 h-7 border-2 border-[#A99BF7] border-t-transparent rounded-full animate-spin mb-2.5" />
            <p className="text-xs font-medium">Loading MediaPipe Face & Iris Landmarker...</p>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-[#E6E3FA] flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          {cameraStatus === 'ready' ? (
            faceDetected ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#35B779] shrink-0" aria-hidden="true" />
                <span className="font-medium text-[#25234A]">Face & iris landmarks locked</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-[#F2B84B] shrink-0" aria-hidden="true" />
                <span className="font-medium text-[#A87518]">
                  Face not detected — center your head in frame
                </span>
              </>
            )
          ) : (
            <span className="text-[#5C597E]">Camera status: {cameraStatus}</span>
          )}
        </div>

        {frameQuality && cameraStatus === 'ready' && (
          <div className="flex items-center gap-1.5 text-[#5C597E] tabular-nums">
            <Sun
              className={`w-3.5 h-3.5 shrink-0 ${
                frameQuality.lightingStatus === 'good'
                  ? 'text-[#35B779]'
                  : 'text-[#F2B84B]'
              }`}
              aria-hidden="true"
            />
            <span>
              Lighting:{' '}
              <strong className="font-medium text-[#25234A]">
                {frameQuality.lightingStatus === 'good'
                  ? 'Good'
                  : frameQuality.lightingStatus === 'too-dark'
                    ? 'Low'
                    : 'Bright glare'}
              </strong>{' '}
              ({frameQuality.brightness})
            </span>
          </div>
        )}
      </div>

      {frameQuality && frameQuality.lightingStatus !== 'good' && cameraStatus === 'ready' && (
        <div className="px-4 py-2.5 bg-[#FFF9EB] border-t border-[#F2B84B]/30 text-xs text-[#7D550E]">
          {frameQuality.guidance}
        </div>
      )}
    </div>
  );
};
