import React from 'react';
import { Eye, CheckCircle2, XCircle } from 'lucide-react';
import { GAZE_CONFIG } from '../utils/cv/gazeConfig';
import type { EyeLandmarkSample, PerEyeMetrics } from '../utils/cv/gazeEstimator';
import type { FrameQualityMetrics } from '../utils/cv/imageProcessing';
import type { EyeMode } from '../types';

interface EyeDebugPanelProps {
  eyeSample: EyeLandmarkSample | null;
  eyeMode: EyeMode;
  faceDetected: boolean;
  frameQuality: FrameQualityMetrics | null;
  activeGateFailure?: string | null;
  compact?: boolean;
}

function EyeColumn({
  title,
  indicesLabel,
  metrics,
  isActive,
  checkBlinkGate,
}: {
  title: string;
  indicesLabel: string;
  metrics: PerEyeMetrics | null;
  isActive: boolean;
  checkBlinkGate: boolean;
}) {
  const validOk = Boolean(metrics?.valid);
  const openOk = Boolean(metrics && !metrics.isBlinking);

  return (
    <div
      className={`rounded-xl border p-3 text-xs ${
        isActive
          ? 'border-[#6554E8]/45 bg-[#F7F6FF]/80'
          : 'border-[#E6E3FA] bg-[#FAFAFE] opacity-75'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-[#25234A]">{title}</p>
          <p className="text-[10px] text-[#5C597E] font-mono">{indicesLabel}</p>
        </div>
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
            isActive
              ? 'bg-[#6554E8]/12 text-[#6554E8]'
              : 'bg-[#E6E3FA]/70 text-[#5C597E]'
          }`}
        >
          {isActive ? 'Tracked' : 'Ignored'}
        </span>
      </div>

      <dl className="mt-2.5 space-y-1.5 font-mono tabular-nums text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <dt className="font-sans text-[#5C597E]">Offset X / Y</dt>
          <dd className="font-semibold text-[#25234A]">
            {metrics ? `${metrics.offsetX.toFixed(3)} / ${metrics.offsetY.toFixed(3)}` : '—'}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-2">
          <dt className="font-sans text-[#5C597E]">Valid</dt>
          <dd
            className={`inline-flex items-center gap-1 font-semibold ${
              !metrics
                ? 'text-[#5C597E]'
                : validOk
                  ? 'text-[#238858]'
                  : 'text-[#C24550]'
            }`}
          >
            {metrics ? (
              <>
                {validOk ? (
                  <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                ) : (
                  <XCircle className="w-3 h-3" aria-hidden="true" />
                )}
                <span>{validOk ? 'true' : 'false'}</span>
                <span className="text-[10px] text-[#5C597E] font-normal">
                  (w={metrics.eyeWidth.toFixed(3)})
                </span>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-2">
          <dt className="font-sans text-[#5C597E]">Open Ratio</dt>
          <dd
            className={`inline-flex items-center gap-1 font-semibold ${
              !metrics
                ? 'text-[#5C597E]'
                : openOk
                  ? 'text-[#238858]'
                  : checkBlinkGate
                    ? 'text-[#C24550]'
                    : 'text-[#A87518]'
            }`}
          >
            {metrics ? (
              <>
                <span>{metrics.openRatio.toFixed(3)}</span>
                <span className="text-[10px] font-sans font-normal">
                  {openOk ? 'open' : 'closed'} (≥{GAZE_CONFIG.MIN_EYE_OPEN_RATIO})
                </span>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export const EyeDebugPanel: React.FC<EyeDebugPanelProps> = ({
  eyeSample,
  eyeMode,
  faceDetected,
  frameQuality,
  activeGateFailure,
  compact = false,
}) => {
  const sample = faceDetected ? eyeSample : null;
  const lightingOk = frameQuality ? frameQuality.brightnessOk : true;
  const leftActive = eyeMode === 'left' || eyeMode === 'both';
  const rightActive = eyeMode === 'right' || eyeMode === 'both';

  return (
    <div className="rounded-xl border border-[#E6E3FA] bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-[#6554E8]" aria-hidden="true" />
          <h4 className="font-display text-xs font-bold text-[#25234A]">
            Per-Eye Debug Diagnostics (MediaPipe Anatomical Left / Right)
          </h4>
        </div>
        <span className="font-mono text-[11px] text-[#5C597E] tabular-nums">
          Mode: <strong className="text-[#25234A]">{eyeMode}</strong>
          {sample ? ` · ${sample.landmarkCount} pts` : ''}
        </span>
      </div>

      {!compact && (
        <p className="text-[11px] text-[#5C597E] leading-relaxed">
          &ldquo;Left&rdquo; and &ldquo;Right&rdquo; follow MediaPipe&apos;s anatomical face
          definition (your physical left and right eye). Preview is horizontally mirrored so each
          eye appears on its matching side.
        </p>
      )}

      {/* Side-by-side Left Eye vs Right Eye metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <EyeColumn
          title="Left Eye"
          indicesLabel="corners 362/263 · lids 386/374 · iris 473–477"
          metrics={sample ? sample.leftEye : null}
          isActive={leftActive}
          checkBlinkGate={eyeMode === 'left'}
        />
        <EyeColumn
          title="Right Eye"
          indicesLabel="corners 33/133 · lids 159/145 · iris 468–472"
          metrics={sample ? sample.rightEye : null}
          isActive={rightActive}
          checkBlinkGate={eyeMode === 'right'}
        />
      </div>

      {/* Shared non-eye gates & active gate verdict */}
      <div className="grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums pt-1">
        <div className="rounded-lg bg-[#F7F6FF] px-2.5 py-1.5 border border-[#E6E3FA]/70">
          <span className="block font-sans text-[10px] text-[#5C597E]">Face in Frame</span>
          <strong
            className={
              !sample
                ? 'text-[#5C597E]'
                : sample.faceInFrame
                  ? 'text-[#238858]'
                  : 'text-[#C24550]'
            }
          >
            {sample ? (sample.faceInFrame ? 'PASS' : 'FAIL') : '—'}
          </strong>
        </div>

        <div className="rounded-lg bg-[#F7F6FF] px-2.5 py-1.5 border border-[#E6E3FA]/70">
          <span className="block font-sans text-[10px] text-[#5C597E]">
            Head Pose (±{GAZE_CONFIG.MAX_HEAD_YAW_DEG}°)
          </span>
          <strong
            className={
              !sample
                ? 'text-[#5C597E]'
                : sample.headPoseOk
                  ? 'text-[#238858]'
                  : 'text-[#C24550]'
            }
          >
            {sample
              ? `${sample.headPoseOk ? 'PASS' : 'FAIL'} (${Math.round(sample.yawDeg)}°/${Math.round(
                  sample.pitchDeg
                )}°)`
              : '—'}
          </strong>
        </div>

        <div className="rounded-lg bg-[#F7F6FF] px-2.5 py-1.5 border border-[#E6E3FA]/70">
          <span className="block font-sans text-[10px] text-[#5C597E]">Lighting</span>
          <strong className={lightingOk ? 'text-[#238858]' : 'text-[#C24550]'}>
            {frameQuality
              ? `${lightingOk ? 'PASS' : 'FAIL'} (${frameQuality.brightness})`
              : '—'}
          </strong>
        </div>
      </div>

      {sample && (
        <div
          className={`rounded-lg px-3 py-2 text-[11px] ${
            activeGateFailure
              ? 'bg-[#FFF5F6] border border-[#E76B75]/30 text-[#C24550]'
              : 'bg-[#F3FBF7] border border-[#35B779]/30 text-[#238858]'
          }`}
        >
          <strong>Gate check ({eyeMode}):</strong>{' '}
          {activeGateFailure || 'All active gates passing'}
        </div>
      )}
    </div>
  );
};
