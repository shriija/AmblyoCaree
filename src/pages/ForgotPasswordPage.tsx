import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { authApi, extractApiError } from '../services/api';

export const ForgotPasswordPage: React.FC = () => {
  const [step, setStep] = useState<'request' | 'reset' | 'done'>('request');
  const [email, setEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.forgotPassword(email.trim());
      setInfoMessage(res.message);
      if (res.devResetCode) {
        setDevCodeHint(res.devResetCode);
        setResetCode(res.devResetCode);
      }
      setStep('reset');
    } catch (err) {
      setError(extractApiError(err, 'Could not process password reset request.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.resetPassword({
        email: email.trim(),
        resetCode: resetCode.trim(),
        newPassword,
      });
      setInfoMessage(res.message);
      setStep('done');
    } catch (err) {
      setError(extractApiError(err, 'Could not reset password.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6FF] flex flex-col justify-between p-4 sm:p-6">
      <div className="max-w-[1200px] w-full mx-auto py-2">
        <Link to="/" aria-label="Return to AmblyoCare home">
          <BrandLogo />
        </Link>
      </div>

      <div className="w-full max-w-md mx-auto my-8">
        <div className="rounded-2xl border border-[#E6E3FA] bg-white p-7 sm:p-8">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5C597E] hover:text-[#25234A]"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to Sign In
          </Link>

          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-[#25234A]">
            Reset your password
          </h1>
          <p className="mt-1.5 text-sm text-[#5C597E]">
            {step === 'request'
              ? 'Enter your account email to generate a 15-minute password reset code.'
              : step === 'reset'
                ? 'Enter your reset code and choose a new password.'
                : 'Your password has been updated successfully.'}
          </p>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-[#E76B75]/40 bg-[#FFF5F6] px-4 py-3 text-xs text-[#A3303B] flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {infoMessage && (
            <div className="mt-5 rounded-xl border border-[#35B779]/35 bg-[#F2FBF6] px-4 py-3 text-xs text-[#1E6E46] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p>{infoMessage}</p>
                {devCodeHint && step === 'reset' && (
                  <p className="mt-1.5 font-mono font-semibold text-[#25234A]">
                    Reset code: {devCodeHint}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 'request' && (
            <form onSubmit={handleRequestCode} className="mt-6 space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-xs font-semibold text-[#25234A]">
                  Email address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="mt-1.5 w-full rounded-lg border border-[#E6E3FA] bg-white px-3.5 py-2.5 text-sm text-[#25234A] focus:border-[#6554E8] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#6554E8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#5342D6] disabled:opacity-60 transition-colors"
              >
                {loading ? 'Generating code...' : 'Request Reset Code'}
              </button>
            </form>
          )}

          {step === 'reset' && (
            <form onSubmit={handleResetPassword} className="mt-6 space-y-4">
              <div>
                <label htmlFor="reset-code" className="block text-xs font-semibold text-[#25234A]">
                  Reset code
                </label>
                <input
                  id="reset-code"
                  type="text"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder="Enter 8-character code"
                  required
                  className="mt-1.5 w-full rounded-lg border border-[#E6E3FA] bg-white px-3.5 py-2.5 text-sm font-mono text-[#25234A] focus:border-[#6554E8] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="new-password"
                  className="block text-xs font-semibold text-[#25234A]"
                >
                  New password (min. 8 characters)
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter your new password"
                  required
                  className="mt-1.5 w-full rounded-lg border border-[#E6E3FA] bg-white px-3.5 py-2.5 text-sm text-[#25234A] focus:border-[#6554E8] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#6554E8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#5342D6] disabled:opacity-60 transition-colors"
              >
                {loading ? 'Updating password...' : 'Update Password'}
              </button>
            </form>
          )}

          {step === 'done' && (
            <div className="mt-6">
              <Link
                to="/login"
                className="block w-full text-center rounded-lg bg-[#6554E8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#5342D6] transition-colors"
              >
                Continue to Sign In
              </Link>
            </div>
          )}
        </div>
      </div>

      <div />
    </div>
  );
};
