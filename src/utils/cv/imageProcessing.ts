/**
 * Image preprocessing & lighting diagnostics module.
 * Uses fast offscreen Canvas pixel analysis (and integrates with OpenCV.js if loaded on window.cv)
 * to assess webcam lighting quality and contrast before landmark extraction.
 */

import { GAZE_CONFIG } from './gazeConfig';

export type LightingStatus = 'too-dark' | 'good' | 'overexposed';

export interface FrameQualityMetrics {
  brightness: number; // 0 - 255 average luminance
  contrast: number; // standard deviation of luminance
  lightingStatus: LightingStatus;
  brightnessOk: boolean;
  guidance: string;
  usedOpenCv: boolean;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cv?: any;
  }
}

let analysisCanvas: HTMLCanvasElement | null = null;
let analysisCtx: CanvasRenderingContext2D | null = null;

function getAnalysisContext(): CanvasRenderingContext2D | null {
  if (!analysisCanvas) {
    analysisCanvas = document.createElement('canvas');
    analysisCanvas.width = 128;
    analysisCanvas.height = 96;
    analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });
  }
  return analysisCtx;
}

export function analyzeVideoFrameQuality(video: HTMLVideoElement): FrameQualityMetrics {
  const fallback: FrameQualityMetrics = {
    brightness: 0,
    contrast: 0,
    lightingStatus: 'too-dark',
    brightnessOk: false,
    guidance: 'Waiting for webcam video stream.',
    usedOpenCv: false,
  };

  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    return fallback;
  }

  const ctx = getAnalysisContext();
  if (!ctx || !analysisCanvas) return fallback;

  ctx.drawImage(video, 0, 0, analysisCanvas.width, analysisCanvas.height);

  // Use OpenCV.js matrix operations if available in window.cv
  if (typeof window !== 'undefined' && window.cv && typeof window.cv.imread === 'function') {
    try {
      const src = window.cv.imread(analysisCanvas);
      const gray = new window.cv.Mat();
      const mean = new window.cv.Mat();
      const stddev = new window.cv.Mat();
      window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY);
      window.cv.meanStdDev(gray, mean, stddev);

      const brightness = mean.doubleAt(0, 0);
      const contrast = stddev.doubleAt(0, 0);

      src.delete();
      gray.delete();
      mean.delete();
      stddev.delete();

      return classifyLighting(brightness, contrast, true);
    } catch {
      // Fall through to native Canvas pixel pipeline
    }
  }

  const imageData = ctx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data;
  const pixelCount = analysisCanvas.width * analysisCanvas.height;

  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < imageData.length; i += 4) {
    const lum = 0.2126 * imageData[i] + 0.7152 * imageData[i + 1] + 0.0722 * imageData[i + 2];
    sum += lum;
    sumSq += lum * lum;
  }

  const brightness = sum / pixelCount;
  const variance = Math.max(0, sumSq / pixelCount - brightness * brightness);
  const contrast = Math.sqrt(variance);

  return classifyLighting(brightness, contrast, false);
}

function classifyLighting(
  brightness: number,
  contrast: number,
  usedOpenCv: boolean
): FrameQualityMetrics {
  const roundedBrightness = Math.round(brightness);
  const roundedContrast = Math.round(contrast);

  if (brightness < GAZE_CONFIG.MIN_BRIGHTNESS_OK) {
    return {
      brightness: roundedBrightness,
      contrast: roundedContrast,
      lightingStatus: 'too-dark',
      brightnessOk: false,
      guidance: 'Face too dark: face a light source or turn on a front-facing lamp.',
      usedOpenCv,
    };
  }

  if (brightness > GAZE_CONFIG.MAX_BRIGHTNESS_OK) {
    return {
      brightness: roundedBrightness,
      contrast: roundedContrast,
      lightingStatus: 'overexposed',
      brightnessOk: false,
      guidance: 'Too much glare: reduce bright backlighting behind you.',
      usedOpenCv,
    };
  }

  return {
    brightness: roundedBrightness,
    contrast: roundedContrast,
    lightingStatus: 'good',
    brightnessOk: true,
    guidance: 'Lighting is suitable for webcam eye landmark tracking.',
    usedOpenCv,
  };
}
