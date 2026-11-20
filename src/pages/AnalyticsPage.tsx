import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { AlertCircle, RefreshCw, X, Play } from 'lucide-react';
import { analyticsApi, extractApiError } from '../services/api';
import { StatCard } from '../components/StatCard';
import type { AnalyticsOverview, GameType, TrainingSession } from '../types';

const GAME_LABELS: Record<GameType, string> = {
  'catch-targets': 'Catch the Targets',
  'follow-object': 'Follow the Moving Object',
  'focus-hold': 'Focus and Hold',
};

const RANGES = [
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: '90d', label: '90 Days' },
  { id: 'all', label: 'All Time' },
];

export const AnalyticsPage: React.FC = () => {
  const [range, setRange] = useState('30d');
  const [gameFilter, setGameFilter] = useState<'all' | GameType>('all');
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<TrainingSession | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const overview = await analyticsApi.getOverview({ range, gameType: gameFilter });
      setData(overview);
    } catch (err) {
      setError(extractApiError(err, 'Could not load analytics data.'));
    } finally {
      setLoading(false);
    }
  }, [gameFilter, range]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-20 rounded-2xl bg-white border border-[#E6E3FA] animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-white border border-[#E6E3FA] animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 rounded-2xl bg-white border border-[#E6E3FA] animate-pulse" />
          <div className="h-72 rounded-2xl bg-white border border-[#E6E3FA] animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-[#E76B75]/40 bg-white p-6 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#E76B75] shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display font-bold text-[#25234A]">Unable to load analytics</h2>
            <p className="text-sm text-[#5C597E] mt-1">{error}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadAnalytics()}
          className="inline-flex items-center gap-2 rounded-lg border border-[#E6E3FA] px-4 py-2 text-sm font-medium text-[#25234A] hover:bg-[#F7F6FF]"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const { summary, trendSeries, dailyActivity, eyeComparison, recentSessions } = data;

  const eyeChartData = eyeComparison.supported
    ? [
        {
          eye: 'Left Eye',
          accuracy: eyeComparison.left?.averageAccuracy ?? 0,
          reactionTime: eyeComparison.left?.averageReactionTime ?? 0,
          sessions: eyeComparison.left?.sessions ?? 0,
        },
        {
          eye: 'Right Eye',
          accuracy: eyeComparison.right?.averageAccuracy ?? 0,
          reactionTime: eyeComparison.right?.averageReactionTime ?? 0,
          sessions: eyeComparison.right?.sessions ?? 0,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <section className="rounded-2xl border border-[#E6E3FA] bg-white p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-[#25234A]">
            Progress & Performance Analytics
          </h2>
          <p className="text-xs text-[#5C597E] mt-0.5">
            All charts reflect saved sessions in your account — no placeholder or synthetic history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F7F6FF] border border-[#E6E3FA]">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  range === r.id
                    ? 'bg-white text-[#6554E8] shadow-xs'
                    : 'text-[#5C597E] hover:text-[#25234A]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter by exercise type"
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value as 'all' | GameType)}
            className="rounded-lg border border-[#E6E3FA] bg-white px-3 py-2 text-xs font-medium text-[#25234A] focus:border-[#6554E8] focus:outline-none"
          >
            <option value="all">All Exercises</option>
            <option value="catch-targets">Catch the Targets</option>
            <option value="follow-object">Follow the Moving Object</option>
            <option value="focus-hold">Focus and Hold</option>
          </select>
        </div>
      </section>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Sessions in Range" value={summary.totalSessions} />
        <StatCard
          label="Total Training Time"
          value={
            summary.totalTrainingTime >= 60
              ? `${Math.floor(summary.totalTrainingTime / 60)}m ${summary.totalTrainingTime % 60}s`
              : `${summary.totalTrainingTime}s`
          }
        />
        <StatCard
          label="Average Accuracy"
          value={summary.totalSessions > 0 ? `${summary.averageAccuracy.toFixed(1)}%` : '—'}
          tone={
            summary.totalSessions === 0
              ? 'default'
              : summary.averageAccuracy >= 75
                ? 'success'
                : 'default'
          }
        />
        <StatCard
          label="Average Reaction Time"
          value={summary.averageReactionTime > 0 ? `${summary.averageReactionTime} ms` : '—'}
        />
        <StatCard label="Total Score" value={summary.totalScore.toLocaleString()} />
      </section>

      {/* Empty State if zero sessions in filter */}
      {summary.totalSessions === 0 ? (
        <section className="rounded-2xl border border-dashed border-[#E6E3FA] bg-white p-12 text-center">
          <h3 className="font-display text-lg font-bold text-[#25234A]">
            No recorded training sessions for this filter
          </h3>
          <p className="mt-2 text-sm text-[#5C597E] max-w-md mx-auto">
            Complete a visual training session to view real accuracy curves, reaction-time trends,
            and score history charts.
          </p>
          <Link
            to="/training"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#5342D6]"
          >
            <Play className="w-4 h-4 fill-current" />
            Go to Training Games
          </Link>
        </section>
      ) : (
        <>
          {/* Trend Line Charts */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-[#E6E3FA] bg-white p-6">
              <h3 className="font-display text-base font-bold text-[#25234A]">Accuracy Trend</h3>
              <p className="text-xs text-[#5C597E] mt-0.5">
                Session-by-session accuracy percentage
              </p>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendSeries} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6E3FA" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5C597E' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#5C597E' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E6E3FA',
                        borderRadius: '10px',
                        fontSize: '12px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="accuracy"
                      name="Accuracy (%)"
                      stroke="#6554E8"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: '#6554E8' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-[#E6E3FA] bg-white p-6">
              <h3 className="font-display text-base font-bold text-[#25234A]">
                Reaction-Time Trend
              </h3>
              <p className="text-xs text-[#5C597E] mt-0.5">
                Average response latency in milliseconds (lower is faster)
              </p>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendSeries} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6E3FA" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5C597E' }} axisLine={false} tickLine={false} />
                    <YAxis unit="ms" tick={{ fontSize: 11, fill: '#5C597E' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E6E3FA',
                        borderRadius: '10px',
                        fontSize: '12px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="reactionTime"
                      name="Reaction Time (ms)"
                      stroke="#35B779"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: '#35B779' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Daily Score Bar Chart + Left/Right Eye Comparison */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-2xl border border-[#E6E3FA] bg-white p-6">
              <h3 className="font-display text-base font-bold text-[#25234A]">
                Daily Activity & Score History
              </h3>
              <p className="text-xs text-[#5C597E] mt-0.5">
                Total score earned per active training day
              </p>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyActivity} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6E3FA" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5C597E' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#5C597E' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E6E3FA',
                        borderRadius: '10px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="totalScore" name="Total Score" fill="#6554E8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-2xl border border-[#E6E3FA] bg-white p-6">
              <h3 className="font-display text-base font-bold text-[#25234A]">
                Left-Eye vs. Right-Eye Comparison
              </h3>
              <p className="text-xs text-[#5C597E] mt-0.5">
                Computed strictly from monocular Left Eye / Right Eye training sessions
              </p>

              {eyeComparison.supported ? (
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={eyeChartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6E3FA" vertical={false} />
                      <XAxis dataKey="eye" tick={{ fontSize: 12, fill: '#25234A' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#5C597E' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          borderColor: '#E6E3FA',
                          borderRadius: '10px',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="accuracy" name="Avg Accuracy (%)" fill="#A99BF7" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="mt-6 rounded-xl border border-dashed border-[#E6E3FA] bg-[#F7F6FF]/60 p-6 text-xs text-[#5C597E] leading-relaxed">
                  <p className="font-semibold text-[#25234A]">
                    No monocular sessions recorded in this date range
                  </p>
                  <p className="mt-2">
                    AmblyoCare only displays left-eye and right-eye comparison charts when you
                    explicitly complete sessions in <strong>Left Eye</strong> or{' '}
                    <strong>Right Eye</strong> mode on the Training page.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Session History Table */}
          <section className="rounded-2xl border border-[#E6E3FA] bg-white p-6">
            <div className="mb-4">
              <h3 className="font-display text-base font-bold text-[#25234A]">Training History</h3>
              <p className="text-xs text-[#5C597E] mt-0.5">
                Click any session row to inspect exact target counts, adaptive parameters, and
                difficulty adjustments.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E6E3FA] text-[#5C597E]">
                    <th className="py-2.5 pr-3 font-semibold">Date & Time</th>
                    <th className="py-2.5 px-3 font-semibold">Exercise</th>
                    <th className="py-2.5 px-3 font-semibold">Level / Eye / Input</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Hits / Total</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Accuracy</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Reaction</th>
                    <th className="py-2.5 pl-3 font-semibold text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6E3FA]/70">
                  {recentSessions.map((s) => (
                    <tr
                      key={s._id}
                      onClick={() => setSelectedSession(s)}
                      className="cursor-pointer hover:bg-[#F7F6FF] transition-colors"
                    >
                      <td className="py-3 pr-3 font-mono tabular-nums text-[#5C597E] whitespace-nowrap">
                        {new Date(s.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-3 font-semibold text-[#25234A]">
                        {GAME_LABELS[s.gameType]}
                      </td>
                      <td className="py-3 px-3 text-[#5C597E] capitalize whitespace-nowrap">
                        {s.difficultyLevel} · {s.eyeMode} ·{' '}
                        {s.inputMode === 'webcam' ? 'Webcam' : 'Mouse Fallback'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#25234A]">
                        {s.targetsHit}/{s.totalTargets}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-[#25234A]">
                        {s.accuracy.toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#5C597E]">
                        {s.averageReactionTime > 0 ? `${s.averageReactionTime} ms` : '—'}
                      </td>
                      <td className="py-3 pl-3 text-right font-mono tabular-nums font-semibold text-[#6554E8]">
                        {s.score}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Session Detail Modal */}
      {selectedSession && (
        <div
          className="fixed inset-0 z-50 bg-[#25234A]/40 flex items-center justify-center p-4"
          onClick={() => setSelectedSession(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[#E6E3FA] bg-white p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-[#6554E8]">Session Details</p>
                <h3 className="font-display text-lg font-bold text-[#25234A]">
                  {GAME_LABELS[selectedSession.gameType]}
                </h3>
                <p className="text-xs text-[#5C597E] mt-0.5">
                  {new Date(selectedSession.createdAt).toLocaleString()} ·{' '}
                  <span className="capitalize">{selectedSession.difficultyLevel}</span> ·{' '}
                  <span className="capitalize">{selectedSession.eyeMode} eye</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                aria-label="Close session details"
                className="p-1.5 rounded-lg text-[#5C597E] hover:bg-[#F7F6FF]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl bg-[#F7F6FF] p-3">
                <span className="text-[#5C597E] block">Accuracy</span>
                <strong className="font-display text-base font-bold tabular-nums text-[#25234A]">
                  {selectedSession.accuracy.toFixed(1)}%
                </strong>
              </div>
              <div className="rounded-xl bg-[#F7F6FF] p-3">
                <span className="text-[#5C597E] block">Avg Reaction Time</span>
                <strong className="font-display text-base font-bold tabular-nums text-[#25234A]">
                  {selectedSession.averageReactionTime > 0
                    ? `${selectedSession.averageReactionTime} ms`
                    : '—'}
                </strong>
              </div>
              <div className="rounded-xl bg-[#F7F6FF] p-3">
                <span className="text-[#5C597E] block">Score</span>
                <strong className="font-display text-base font-bold tabular-nums text-[#6554E8]">
                  {selectedSession.score}
                </strong>
              </div>
              <div className="rounded-xl bg-[#F7F6FF] p-3">
                <span className="text-[#5C597E] block">Targets Hit</span>
                <strong className="font-mono font-semibold tabular-nums text-[#238858]">
                  {selectedSession.targetsHit}
                </strong>
              </div>
              <div className="rounded-xl bg-[#F7F6FF] p-3">
                <span className="text-[#5C597E] block">Targets Missed</span>
                <strong className="font-mono font-semibold tabular-nums text-[#C24550]">
                  {selectedSession.targetsMissed}
                </strong>
              </div>
              <div className="rounded-xl bg-[#F7F6FF] p-3">
                <span className="text-[#5C597E] block">Active Duration</span>
                <strong className="font-mono font-semibold tabular-nums text-[#25234A]">
                  {selectedSession.sessionDuration} s
                </strong>
              </div>
              <div className="rounded-xl bg-[#F7F6FF] p-3">
                <span className="text-[#5C597E] block">Off-Screen Time</span>
                <strong className="font-mono font-semibold tabular-nums text-[#A87518]">
                  {selectedSession.offScreenTime ?? 0} s
                </strong>
              </div>
              <div className="rounded-xl bg-[#F7F6FF] p-3">
                <span className="text-[#5C597E] block">Invalid Samples</span>
                <strong className="font-mono font-semibold tabular-nums text-[#5C597E]">
                  {selectedSession.invalidSampleCount ?? 0}
                </strong>
              </div>
            </div>

            {selectedSession.difficultyAdjustment && (
              <div className="rounded-xl border border-[#E6E3FA] bg-[#F7F6FF]/60 p-4 text-xs">
                <p className="font-semibold text-[#25234A]">
                  Adaptive Difficulty Outcome:{' '}
                  <span className="capitalize text-[#6554E8]">
                    {selectedSession.difficultyAdjustment.direction}
                  </span>
                </p>
                <p className="mt-1 text-[#5C597E] leading-relaxed">
                  {selectedSession.difficultyAdjustment.reason}
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="rounded-lg bg-[#6554E8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5342D6]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
