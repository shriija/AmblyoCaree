import { useCallback, useEffect, useRef, useState } from 'react';
import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { getFaceLandmarker } from '../utils/cv/faceLandmarkerService';
import {
  extractEyeLandmarks,
  GazeSmoother,
  LANDMARK_INDICES,
  mapGazeToScreen,
  type EyeLandmarkSample,
  type MappedGazePoint,
} from '../utils/cv/gazeEstimator';
import {
  analyzeVideoFrameQuality,
  type FrameQualityMetrics,
} from '../utils/cv/imageProcessing';
import { GAZE_CONFIG } from '../utils/cv/gazeConfig';
import type { EyeMode, GazeStatus, ReferenceValues } from '../types';

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'loading-model'
  | 'ready'
  | 'denied'
  | 'error';

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

export interface GazeFrameEvent {
  faceDetected: boolean;
  sample: EyeLandmarkSample | null;
  mapped: MappedGazePoint | null;
  lightingOk: boolean;
  gazeStatus: GazeStatus;
  timestamp: number;
}

export interface UseGazeTrackerOptions {
  referenceValues: ReferenceValues | null;
  eyeMode: EyeMode;
  preferredDeviceId?: string;
  autoStart?: boolean;
  onSample?: (sample: EyeLandmarkSample, mapped: MappedGazePoint) => void;
  onFrame?: (frame: GazeFrameEvent) => void;
}

export function useGazeTracker({
  referenceValues,
  eyeMode,
  preferredDeviceId,
  autoStart = false,
  onSample,
  onFrame,
}: UseGazeTrackerOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const isLoopActiveRef = useRef(false);
  const smootherRef = useRef(new GazeSmoother(GAZE_CONFIG.GAZE_SMOOTHING_ALPHA));
  const lastVideoTimeRef = useRef(-1);
  const lastQualityCheckRef = useRef(0);
  const lastUiSyncRef = useRef(0);
  const frameQualityRef = useRef<FrameQualityMetrics | null>(null);

  // Keep latest options in refs so the continuous rAF loop never tears down or goes stale
  const refValuesRef = useRef<ReferenceValues | null>(referenceValues);
  const eyeModeRef = useRef<EyeMode>(eyeMode);
  const onSampleRef = useRef(onSample);
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    refValuesRef.current = referenceValues;
    smootherRef.current.reset();
  }, [referenceValues]);

  useEffect(() => {
    eyeModeRef.current = eyeMode;
    smootherRef.current.reset();
  }, [eyeMode]);

  useEffect(() => {
    onSampleRef.current = onSample;
  }, [onSample]);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [gazeStatus, setGazeStatus] = useState<GazeStatus>('face-lost');
  const [gazePoint, setGazePoint] = useState<MappedGazePoint | null>(null);
  const [eyeSample, setEyeSample] = useState<EyeLandmarkSample | null>(null);
  const [frameQuality, setFrameQuality] = useState<FrameQualityMetrics | null>(null);
  const [cameras, setCameras] = useState<CameraDeviceOption[]>([]);

  const drawLandmarksOverlay = useCallback((landmarks: NormalizedLandmark[] | null) => {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    const activeMode = eyeModeRef.current;
    const minOverlayLandmarks = activeMode === 'right' ? 473 : 478;
    if (!landmarks || landmarks.length < minOverlayLandmarks) return;

    const trackLeft = activeMode === 'both' || activeMode === 'left';
    const trackRight = activeMode === 'both' || activeMode === 'right';

    // Mirror overlay horizontally to match <video className="-scale-x-100">:
    // MediaPipe's anatomical LEFT eye (x > 0.5 raw) renders on the preview's LEFT side (user's physical left eye);
    // MediaPipe's anatomical RIGHT eye (x < 0.5 raw) renders on the preview's RIGHT side (user's physical right eye).
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);

    const drawEyeSet = (
      cornerIndices: number[],
      irisIndex: number,
      isActive: boolean
    ) => {
      ctx.fillStyle = isActive ? '#A99BF7' : 'rgba(180, 180, 195, 0.35)';
      for (const idx of cornerIndices) {
        const pt = landmarks[idx];
        if (!pt) continue;
        ctx.beginPath();
        ctx.arc(pt.x * width, pt.y * height, isActive ? 3 : 2, 0, Math.PI * 2);
        ctx.fill();
      }

      const iris = landmarks[irisIndex];
      if (!iris) return;

      ctx.strokeStyle = isActive ? '#6554E8' : 'rgba(180, 180, 195, 0.35)';
      ctx.lineWidth = isActive ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(iris.x * width, iris.y * height, isActive ? 8 : 6, 0, Math.PI * 2);
      ctx.stroke();

      if (isActive) {
        ctx.fillStyle = '#35B779';
        ctx.beginPath();
        ctx.arc(iris.x * width, iris.y * height, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (trackLeft) {
      drawEyeSet(
        [
          LANDMARK_INDICES.LEFT_EYE_INNER,
          LANDMARK_INDICES.LEFT_EYE_TOP,
          LANDMARK_INDICES.LEFT_EYE_OUTER,
          LANDMARK_INDICES.LEFT_EYE_BOTTOM,
        ],
        LANDMARK_INDICES.LEFT_IRIS_CENTER,
        true
      );
    }

    if (trackRight) {
      drawEyeSet(
        [
          LANDMARK_INDICES.RIGHT_EYE_OUTER,
          LANDMARK_INDICES.RIGHT_EYE_TOP,
          LANDMARK_INDICES.RIGHT_EYE_INNER,
          LANDMARK_INDICES.RIGHT_EYE_BOTTOM,
        ],
        LANDMARK_INDICES.RIGHT_IRIS_CENTER,
        true
      );
    }

    ctx.restore();
  }, []);

  const stopCamera = useCallback(() => {
    isLoopActiveRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    smootherRef.current.reset();
    lastVideoTimeRef.current = -1;
    frameQualityRef.current = null;
    setFaceDetected(false);
    setGazeStatus('face-lost');
    setGazePoint(null);
    setCameraStatus('idle');
  }, []);

  const enumerateCameras = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${idx + 1}`,
        }));
      setCameras(videoInputs);
    } catch {
      // Ignore enumeration errors before permission
    }
  }, []);

  const runDetectionLoop = useCallback(() => {
    if (!isLoopActiveRef.current || !streamRef.current) {
      return;
    }

    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    if (video && landmarker) {
      // Resilience: if video element ever lost srcObject across a render, re-attach immediately
      if (video.srcObject !== streamRef.current) {
        video.srcObject = streamRef.current;
        void video.play().catch(() => {});
        lastVideoTimeRef.current = -1;
      }

      const nowMs = performance.now();

      if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;

        // Inspect lighting quality immediately on first frame and every 700ms thereafter
        if (!frameQualityRef.current || nowMs - lastQualityCheckRef.current > 700) {
          lastQualityCheckRef.current = nowMs;
          const quality = analyzeVideoFrameQuality(video);
          frameQualityRef.current = quality;
          setFrameQuality(quality);
        }

        const lightingOk = frameQualityRef.current ? frameQualityRef.current.brightnessOk : true;

        try {
          const result = landmarker.detectForVideo(video, nowMs);
          const faceLandmarks = result.faceLandmarks?.[0] || null;
          drawLandmarksOverlay(faceLandmarks);

          // Extract per-eye metrics whenever a face mesh (>=468 pts) is present so diagnostics
          // show exactly why an eye failed (e.g., missing iris landmarks); sample.valid still gates tracking.
          if (faceLandmarks && faceLandmarks.length >= 468) {
            const sample = extractEyeLandmarks(faceLandmarks, eyeModeRef.current);
            let finalMapped: MappedGazePoint | null = null;

            if (sample.valid) {
              const rawMapped = mapGazeToScreen(
                sample,
                refValuesRef.current,
                window.innerWidth,
                window.innerHeight,
                eyeModeRef.current,
                lightingOk
              );

              // Smooth UNCLAMPED viewport coordinates — never clamp smoothed coordinates back on screen
              const smoothed = smootherRef.current.smooth(rawMapped.rawX, rawMapped.rawY);
              const screenW = Math.max(1, window.innerWidth);
              const screenH = Math.max(1, window.innerHeight);
              const tol = GAZE_CONFIG.CONTAINER_TOLERANCE_MARGIN_PX;

              const smoothedInScreen =
                smoothed.x >= -tol &&
                smoothed.x <= screenW + tol &&
                smoothed.y >= -tol &&
                smoothed.y <= screenH + tol;

              const smoothedInBounds =
                rawMapped.valid &&
                !rawMapped.isBlinking &&
                rawMapped.headPoseOk &&
                rawMapped.faceInFrame &&
                rawMapped.lightingOk &&
                rawMapped.inFeatureBounds &&
                smoothedInScreen;

              finalMapped = {
                ...rawMapped,
                rawX: smoothed.x,
                rawY: smoothed.y,
                rawXNorm: smoothed.x / screenW,
                rawYNorm: smoothed.y / screenH,
                xScreen: smoothed.x,
                yScreen: smoothed.y,
                xNorm: smoothed.x / screenW,
                yNorm: smoothed.y / screenH,
                clampedX: Math.min(screenW, Math.max(0, smoothed.x)),
                clampedY: Math.min(screenH, Math.max(0, smoothed.y)),
                inScreenBounds: smoothedInScreen,
                inBounds: smoothedInBounds,
                gazeStatus: smoothedInBounds ? 'ok' : 'off-screen',
              };
            } else {
              smootherRef.current.reset();
            }

            const frameStatus: GazeStatus = finalMapped ? finalMapped.gazeStatus : 'face-lost';

            // Deliver every raw frame synchronously via ref callbacks (zero React state lag)
            onFrameRef.current?.({
              faceDetected: true,
              sample,
              mapped: finalMapped,
              lightingOk,
              gazeStatus: frameStatus,
              timestamp: nowMs,
            });
            if (sample.valid && finalMapped) {
              onSampleRef.current?.(sample, finalMapped);
            }

            // Update React UI readouts smoothly (~30Hz max to avoid unnecessary re-renders)
            if (nowMs - lastUiSyncRef.current >= 33) {
              lastUiSyncRef.current = nowMs;
              setFaceDetected(true);
              setEyeSample(sample);
              setGazeStatus(frameStatus);
              setGazePoint(finalMapped);
            }
          } else {
            smootherRef.current.reset();
            onFrameRef.current?.({
              faceDetected: false,
              sample: null,
              mapped: null,
              lightingOk,
              gazeStatus: 'face-lost',
              timestamp: nowMs,
            });
            if (nowMs - lastUiSyncRef.current >= 33) {
              lastUiSyncRef.current = nowMs;
              setFaceDetected(false);
              setGazeStatus('face-lost');
              setGazePoint(null);
            }
          }
        } catch {
          // Ignore transient single-frame detection exceptions without stopping the loop
        }
      }
    }

    if (isLoopActiveRef.current) {
      rafRef.current = requestAnimationFrame(runDetectionLoop);
    }
  }, [drawLandmarksOverlay]);

  const startCamera = useCallback(
    async (overrideDeviceId?: string) => {
      setErrorMessage(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('error');
        setErrorMessage(
          'Your browser does not support webcam access (navigator.mediaDevices.getUserMedia). You can switch to the Mouse Pointer Fallback mode in Training.'
        );
        return false;
      }

      stopCamera();
      setCameraStatus('requesting');

      try {
        const targetDevice = overrideDeviceId ?? preferredDeviceId;
        const constraints: MediaStreamConstraints = {
          video: targetDevice
            ? { deviceId: { exact: targetDevice }, width: { ideal: 640 }, height: { ideal: 480 } }
            : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        await enumerateCameras();

        setCameraStatus('loading-model');
        const landmarker = await getFaceLandmarker();
        landmarkerRef.current = landmarker;

        setCameraStatus('ready');
        lastVideoTimeRef.current = -1;
        isLoopActiveRef.current = true;
        rafRef.current = requestAnimationFrame(runDetectionLoop);
        return true;
      } catch (err) {
        stopCamera();
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraStatus('denied');
          setErrorMessage(
            'Camera permission was denied. Allow camera access in your browser address bar settings and try again.'
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setCameraStatus('error');
          setErrorMessage(
            'No webcam was detected on this device. Connect a camera or use the Mouse Pointer Fallback for testing.'
          );
        } else {
          setCameraStatus('error');
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'Unable to start webcam gaze tracking. Please check camera permissions and network access.'
          );
        }
        return false;
      }
    },
    [enumerateCameras, preferredDeviceId, runDetectionLoop, stopCamera]
  );

  useEffect(() => {
    if (autoStart) {
      void startCamera();
    }
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    videoRef,
    overlayCanvasRef,
    cameraStatus,
    errorMessage,
    faceDetected,
    gazeStatus,
    gazePoint,
    eyeSample,
    frameQuality,
    cameras,
    startCamera,
    stopCamera,
    enumerateCameras,
  };
}
