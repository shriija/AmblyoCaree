import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let landmarkerInstance: FaceLandmarker | null = null;
let loadingPromise: Promise<FaceLandmarker> | null = null;

const MEDIAPIPE_WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';
const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerInstance) {
    return landmarkerInstance;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT);
      try {
        landmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: FACE_LANDMARKER_MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
      } catch {
        // Fallback to CPU delegate when WebGL/GPU delegate is unavailable
        landmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: FACE_LANDMARKER_MODEL_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
      }
      return landmarkerInstance;
    } catch (error) {
      loadingPromise = null;
      throw new Error(
        error instanceof Error
          ? `Could not initialize MediaPipe Face Landmarker: ${error.message}`
          : 'Could not initialize MediaPipe Face Landmarker.'
      );
    }
  })();

  return loadingPromise;
}
