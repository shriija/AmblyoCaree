import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// MediaPipe / TensorFlow Lite WASM (Emscripten) routes C++ INFO stderr logs through console.error.
// Redirect only those harmless informational TFLite/MediaPipe startup lines to console.info.
const MEDIAPIPE_WASM_INFO_PATTERNS = [
  /^INFO:\s*Created TensorFlow Lite XNNPACK delegate for CPU\.?/i,
  /^INFO:\s*Created TensorFlow Lite/i,
  /^WARNING:\s*Logging before InitGoogleLogging/i,
  /^[IW]\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+.*(gl_context|inference_feedback_manager|landmark_projection_calculator|xnnpack)/i,
];

function isMediaPipeWasmInfoLog(args: unknown[]): boolean {
  if (args.length === 0 || typeof args[0] !== 'string') return false;
  const text = args[0].trim();
  return MEDIAPIPE_WASM_INFO_PATTERNS.some((pattern) => pattern.test(text));
}

const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (isMediaPipeWasmInfoLog(args)) {
    console.info(...args);
    return;
  }
  originalConsoleError(...args);
};

// Prevent third-party browser extensions (e.g., MetaMask inpage.js) from interrupting the app
function isBrowserExtensionError(message: string, source?: string): boolean {
  const combined = `${message} ${source || ''}`;
  return (
    combined.includes('chrome-extension://') ||
    combined.includes('moz-extension://') ||
    combined.includes('Failed to connect to MetaMask')
  );
}

window.addEventListener(
  'error',
  (event) => {
    const stack = event.error instanceof Error ? event.error.stack || '' : '';
    if (isBrowserExtensionError(`${event.message || ''} ${stack}`, event.filename)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true
);

window.addEventListener(
  'unhandledrejection',
  (event) => {
    const reason = event.reason;
    const text =
      reason instanceof Error
        ? `${reason.message} ${reason.stack || ''}`
        : typeof reason === 'string'
          ? reason
          : '';
    if (isBrowserExtensionError(text)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true
);

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

