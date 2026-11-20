import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useAuthStore } from '../store/useAuthStore';

export const LoginPage: React.FC = () => {
  const { login, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectPath = (location.state as { from?: string } | null)?.from || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setLocalError('Please enter your password.');
      return;
    }

    const ok = await login(email.trim(), password);
    if (ok) {
      navigate(redirectPath, { replace: true });
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen bg-[#F7F6FF] flex flex-col justify-between p-4 sm:p-6">
      <div className="max-w-[1200px] w-full mx-auto py-2">
        <Link to="/" aria-label="Return to AmblyoCare home">
          <BrandLogo />
        </Link>
      </div>

      <div className="w-full max-w-md mx-auto my-8">
        <div className="rounded-2xl border border-[#E6E3FA] bg-white p-7 sm:p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#25234A]">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-[#5C597E]">
            Sign in to continue your visual training sessions and progress history.
          </p>

          {displayError && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-[#E76B75]/40 bg-[#FFF5F6] px-4 py-3 text-xs text-[#A3303B] flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{displayError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-[#25234A]">
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="mt-1.5 w-full rounded-lg border border-[#E6E3FA] bg-white px-3.5 py-2.5 text-sm text-[#25234A] placeholder:text-[#5C597E]/60 focus:border-[#6554E8] focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-[#25234A]"
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-[#6554E8] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="mt-1.5 relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full rounded-lg border border-[#E6E3FA] bg-white pl-3.5 pr-11 py-2.5 text-sm text-[#25234A] placeholder:text-[#5C597E]/60 focus:border-[#6554E8] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-[#5C597E] hover:text-[#25234A]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#6554E8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#5342D6] disabled:opacity-60 transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-[#5C597E]">
            New to AmblyoCare?{' '}
            <Link to="/signup" className="font-semibold text-[#6554E8] hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>

      <p className="text-center text-xs text-[#5C597E] pb-2">
        AmblyoCare supports visual training practice and is not a substitute for clinical eye care.
      </p>
    </div>
  );
};
