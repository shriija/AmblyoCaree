import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ArrowRight, Crosshair, Play, AlertCircle, RefreshCw } from 'lucide-react';
import { analyticsApi, extractApiError } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { StatCard } from '../components/StatCard';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import type { AnalyticsOverview, GameType } from '../types';

const GAME_LABELS: Record<GameType, string> = {
  'catch-targets': 'Catch the Targets',
  'follow-object': 'Follow the Moving Object',
  'focus-hold': 'Focus and Hold',
};

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const overview = await analyticsApi.getOverview({ range: '7d' });
      setData(overview);
    } catch (err) {
      setError(extractApiError(err, 'Could not load dashboard metrics.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-28 rounded-2xl bg-white border border-[#E6E3FA] animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-white border border-[#E6E3FA] animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-2xl bg-white border border-[#E6E3FA] animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-[#E76B75]/40 bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#E76B75] shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display font-bold text-[#25234A]">Unable to load dashboard</h2>
            <p className="mt-1 text-sm text-[#5C597E]">{error}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadDashboard}
          className="inline-flex items-center gap-2 rounded-lg border border-[#E6E3FA] px-4 py-2 text-sm font-medium text-[#25234A] hover:bg-[#F7F6FF]"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const { progress, calibrationStatus, dailyActivity, eyeComparison, recentSessions, recommendations } =
    data;

  const isCalibrated = calibrationStatus === 'completed';

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <section className="rounded-2xl border border-[#E6E3FA] bg-white p-6 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[#5C597E]">
            Personal Training Workspace · Current level:{' '}
            <span className="font-semibold text-[#6554E8] capitalize">
              {progress.currentDifficultyLevel}
            </span>
          </p>
          <h2 className="mt-1.5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#25234A]">
            Welcome back, {user?.name?.split(' ')[0] || 'there'}
          </h2>
          <p className="mt-2 text-sm text-[#5C597E] max-w-2xl leading-relaxed">
            {progress.lastAdjustmentNote}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5C597E]">
            <span>{user?.email}</span>
            <span aria-hidden="true">·</span>
            <span>
              Calibration:{' '}
              <strong className={isCalibrated ? 'text-[#238858]' : 'text-[#A87518]'}>
                {isCalibrated ? 'Ready' : 'Not calibrated yet'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Default Eye Focus:{' '}
              <strong className="text-[#25234A] capitalize">
                {user?.preferences?.targetEye || 'both'}
              </strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Link
            to="/calibration"
            className="inline-flex items-center gap-2 rounded-lg border border-[#E6E3FA] bg-[#F7F6FF] px-4 py-2.5 text-sm font-medium text-[#25234A] hover:bg-[#F0EDFF] transition-colors whitespace-nowrap"
          >
            <Crosshair className="w-4 h-4 text-[#6554E8]" aria-hidden="true" />
            {isCalibrated ? 'Recalibrate Eyes' : 'Calibrate Eyes'}
          </Link>
          <Link
            to="/training"
            className="inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#5342D6] transition-colors whitespace-nowrap"
          >
            <Play className="w-4 h-4 fill-current" aria-hidden="true" />
            Start Training
          </Link>
        </div>
      </section>

      {/* Core Metric Grid (Real MongoDB/Persisted Totals) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Training Sessions"
          value={progress.totalSessions}
          subtext={
            progress.totalTrainingTime > 0
              ? `${Math.max(1, Math.round(progress.totalTrainingTime / 60))} min total practice`
              : 'Complete your first session to begin'
          }
        />
        <StatCard
          label="Average Accuracy"
          value={progress.totalSessions > 0 ? `${progress.averageAccuracy.toFixed(1)}%` : '—'}
          subtext="Calculated from saved targets hit / total"
          tone={
            progress.totalSessions === 0
              ? 'default'
              : progress.averageAccuracy >= 75
                ? 'success'
                : progress.averageAccuracy >= 55
                  ? 'warning'
                  : 'error'
          }
        />
        <StatCard
          label="Average Reaction Time"
          value={progress.averageReactionTime > 0 ? `${progress.averageReactionTime} ms` : '—'}
          subtext="Response time minus display time"
        />
        <StatCard
          label="Total Score"
          value={progress.totalScore.toLocaleString()}
          subtext="Cumulative points across exercises"
        />
      </section>

      {/* Weekly Progress + Eye Comparison */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-2xl border border-[#E6E3FA] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <div>
              <h3 className="font-display text-base font-bold text-[#25234A]">
                Weekly Accuracy Progress
              </h3>
              <p className="text-xs text-[#5C597E] mt-0.5">
                Daily average accuracy over the past 7 days from saved sessions
              </p>
            </div>
            <Link
              to="/analytics"
              className="text-xs font-semibold text-[#6554E8] hover:underline inline-flex items-center gap-1 whitespace-nowrap"
            >
              Full Analytics
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {dailyActivity.length === 0 ? (
            <div className="h-60 rounded-xl border border-dashed border-[#E6E3FA] bg-[#F7F6FF]/60 flex flex-col items-center justify-center p-6 text-center">
              <p className="text-sm font-semibold text-[#25234A]">No sessions logged this week yet</p>
              <p className="mt-1 text-xs text-[#5C597E] max-w-sm">
                Complete a training exercise to chart your real accuracy and reaction-time trends
                here.
              </p>
              <Link
                to="/training"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5342D6]"
              >
                Start First Session
              </Link>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyActivity} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="accuracyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6554E8" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#6554E8" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6E3FA" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#5C597E' }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[0, 100]}
                    unit="%"
                    tick={{ fontSize: 12, fill: '#5C597E' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E6E3FA',
                      borderRadius: '10px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="avgAccuracy"
                    name="Avg Accuracy (%)"
                    stroke="#6554E8"
                    strokeWidth={2.5}
                    fill="url(#accuracyFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Left vs Right Eye Performance Comparison */}
        <div className="lg:col-span-4 rounded-2xl border border-[#E6E3FA] bg-white p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-[#25234A]">
              Left vs. Right Eye Comparison
            </h3>
            <p className="text-xs text-[#5C597E] mt-0.5">
              Displayed from sessions explicitly recorded in Left Eye or Right Eye mode
            </p>

            {eyeComparison.supported ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-[#E6E3FA] bg-[#F7F6FF]/60 p-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#25234A]">
                    <span>Left Eye Sessions</span>
                    <span className="font-mono tabular-nums text-[#6554E8]">
                      {eyeComparison.left ? `${eyeComparison.left.sessions} logged` : '0 logged'}
                    </span>
                  </div>
                  {eyeComparison.left ? (
                    <div className="mt-2.5 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#5C597E] block">Accuracy</span>
                        <span className="font-display text-base font-bold tabular-nums text-[#25234A]">
                          {eyeComparison.left.averageAccuracy}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[#5C597E] block">Avg Reaction</span>
                        <span className="font-display text-base font-bold tabular-nums text-[#25234A]">
                          {eyeComparison.left.averageReactionTime} ms
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-[#5C597E]">
                      No Left Eye sessions logged in the past 7 days.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-[#E6E3FA] bg-[#F7F6FF]/60 p-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#25234A]">
                    <span>Right Eye Sessions</span>
                    <span className="font-mono tabular-nums text-[#35B779]">
                      {eyeComparison.right ? `${eyeComparison.right.sessions} logged` : '0 logged'}
                    </span>
                  </div>
                  {eyeComparison.right ? (
                    <div className="mt-2.5 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#5C597E] block">Accuracy</span>
                        <span className="font-display text-base font-bold tabular-nums text-[#25234A]">
                          {eyeComparison.right.averageAccuracy}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[#5C597E] block">Avg Reaction</span>
                        <span className="font-display text-base font-bold tabular-nums text-[#25234A]">
                          {eyeComparison.right.averageReactionTime} ms
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-[#5C597E]">
                      No Right Eye sessions logged in the past 7 days.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-[#E6E3FA] bg-[#F7F6FF]/60 p-5 text-xs text-[#5C597E] leading-relaxed">
                <p className="font-semibold text-[#25234A]">No separate eye sessions yet</p>
                <p className="mt-1.5">
                  To compare left-eye and right-eye metrics accurately, select{' '}
                  <strong className="text-[#25234A]">Left Eye</strong> or{' '}
                  <strong className="text-[#25234A]">Right Eye</strong> focus mode in Training
                  before starting an exercise.
                </p>
              </div>
            )}
          </div>

          <Link
            to="/training"
            className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#6554E8] hover:underline"
          >
            Choose eye mode in Training
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      {/* Recommendations + Recent Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-2xl border border-[#E6E3FA] bg-white p-6">
          <h3 className="font-display text-base font-bold text-[#25234A]">
            Training Recommendations
          </h3>
          <p className="text-xs text-[#5C597E] mt-0.5">
            Software-based training guidance based on your recorded metrics
          </p>

          <div className="mt-5 divide-y divide-[#E6E3FA]">
            {recommendations.map((rec, idx) => (
              <div key={idx} className="py-4 first:pt-0 last:pb-0">
                <p className="text-sm font-semibold text-[#25234A]">{rec.title}</p>
                <p className="mt-1 text-xs text-[#5C597E] leading-relaxed">{rec.detail}</p>
                <Link
                  to={rec.actionPath}
                  className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-[#6554E8] hover:underline"
                >
                  {rec.actionLabel}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 rounded-2xl border border-[#E6E3FA] bg-white p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-display text-base font-bold text-[#25234A]">
                Recent Training Activity
              </h3>
              <p className="text-xs text-[#5C597E] mt-0.5">
                Latest saved sessions from your account
              </p>
            </div>
            <Link
              to="/analytics"
              className="text-xs font-semibold text-[#6554E8] hover:underline whitespace-nowrap"
            >
              View All
            </Link>
          </div>

          {recentSessions.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#5C597E]">
              Your completed training sessions will appear here with accuracy, reaction time, and
              difficulty details.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E6E3FA] text-[#5C597E]">
                    <th className="py-2.5 pr-3 font-semibold">Exercise</th>
                    <th className="py-2.5 px-3 font-semibold">Level / Eye</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Accuracy</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Reaction</th>
                    <th className="py-2.5 pl-3 font-semibold text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6E3FA]/70">
                  {recentSessions.slice(0, 6).map((session) => (
                    <tr key={session._id} className="hover:bg-[#F7F6FF]/60">
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-[#25234A]">
                          {GAME_LABELS[session.gameType]}
                        </p>
                        <p className="text-[11px] text-[#5C597E]">
                          {new Date(session.createdAt).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-[#5C597E] capitalize">
                        {session.difficultyLevel} · {session.eyeMode}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-[#25234A]">
                        {session.accuracy.toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#5C597E]">
                        {session.averageReactionTime > 0 ? `${session.averageReactionTime} ms` : '—'}
                      </td>
                      <td className="py-3 pl-3 text-right font-mono tabular-nums font-semibold text-[#6554E8]">
                        {session.score}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <DisclaimerBanner compact />
    </div>
  );
};
