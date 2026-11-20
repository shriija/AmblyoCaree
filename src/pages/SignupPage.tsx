import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useAuthStore } from '../store/useAuthStore';

export const SignupPage: React.FC = () => {
  const { register, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    if (name.trim().length < 2) {
      setLocalError('Please enter your name (at least 2 characters).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    const ok = await register(name.trim(), email.trim(), password);
    if (ok) {
      navigate('/dashboard', { replace: true });
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
            Create your account
          </h1>
          <p className="mt-1.5 text-sm text-[#5C597E]">
            Set up your personal AmblyoCare profile to save calibration and track training progress.
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
              <label htmlFor="signup-name" className="block text-xs font-semibold text-[#25234A]">
                Full name
              </label>
              <input
                id="signup-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Rivera"
                required
                className="mt-1.5 w-full rounded-lg border border-[#E6E3FA] bg-white px-3.5 py-2.5 text-sm text-[#25234A] placeholder:text-[#5C597E]/60 focus:border-[#6554E8] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="signup-email" className="block text-xs font-semibold text-[#25234A]">
                Email address
              </label>
              <input
                id="signup-email"
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
              <label
                htmlFor="signup-password"
                className="block text-xs font-semibold text-[#25234A]"
              >
                Password (min. 8 characters)
              </label>
              <div className="mt-1.5 relative">
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
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

            <div>
              <label
                htmlFor="signup-confirm"
                className="block text-xs font-semibold text-[#25234A]"
              >
                Confirm password
              </label>
              <input
                id="signup-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                className="mt-1.5 w-full rounded-lg border border-[#E6E3FA] bg-white px-3.5 py-2.5 text-sm text-[#25234A] placeholder:text-[#5C597E]/60 focus:border-[#6554E8] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#6554E8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#5342D6] disabled:opacity-60 transition-colors"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-[#5C597E]">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-[#6554E8] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <p className="text-center text-xs text-[#5C597E] pb-2">
        Your password is encrypted with bcrypt and authenticated using HTTP-only JWT cookies.
      </p>
    </div>
  );
};
