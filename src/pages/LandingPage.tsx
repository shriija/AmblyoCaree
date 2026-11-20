import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye, Target, SlidersHorizontal, LineChart, Menu, X } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { useAuthStore } from '../store/useAuthStore';

const HERO_IMG = '/src/assets/images/hero_vision_training_1795103917878.jpg';
const ABOUT_IMG = '/src/assets/images/about_home_training_1795103917427.jpg';

const FEATURES = [
  {
    number: '01',
    title: 'Webcam-Based Eye Tracking',
    description:
      'Uses MediaPipe facial and iris landmarks through your standard laptop or desktop webcam—no external eye-tracking hardware or VR headsets required.',
    icon: Eye,
    wide: true,
  },
  {
    number: '02',
    title: 'Interactive Visual Training',
    description:
      'Three structured gaze exercises—Catch the Targets, Follow the Moving Object, and Focus and Hold—designed to encourage steady visual fixation and tracking.',
    icon: Target,
    wide: false,
  },
  {
    number: '03',
    title: 'Adaptive Difficulty',
    description:
      'Automatically adjusts target size, speed, spacing, and response windows within safe bounds based on your recorded accuracy and reaction time.',
    icon: SlidersHorizontal,
    wide: false,
  },
  {
    number: '04',
    title: 'Progress Monitoring',
    description:
      'Every completed session is saved to your account so you can review accuracy trends, reaction-time changes, score history, and left- vs. right-eye sessions.',
    icon: LineChart,
    wide: true,
  },
];

const STEPS = [
  {
    step: '01',
    title: 'Create your training profile',
    detail:
      'Register securely to keep your calibration profiles, adaptive difficulty level, and session history saved across visits.',
  },
  {
    step: '02',
    title: 'Calibrate with your webcam',
    detail:
      'Follow 9 on-screen reference points while AmblyoCare maps your eye and iris landmark range to your screen coordinates.',
  },
  {
    step: '03',
    title: 'Practice gaze-guided exercises',
    detail:
      'Complete short visual drills with pause, resume, and clear on-screen feedback. Difficulty adapts gradually after each session.',
  },
  {
    step: '04',
    title: 'Review measurable trends',
    detail:
      'Track accuracy percentages, reaction times in milliseconds, and session totals over 7-day, 30-day, or full-history windows.',
  },
];

export const LandingPage: React.FC = () => {
  const { user } = useAuthStore();
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [aboutImgFailed, setAboutImgFailed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F7F6FF] text-[#25234A]">
      {/* Clean 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[#E6E3FA]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <Link to="/" aria-label="AmblyoCare Home" className="shrink-0">
            <BrandLogo />
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#5C597E]"
          >
            <a
              href="#features"
              className="hover:text-[#25234A] transition-colors whitespace-nowrap shrink-0"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="hover:text-[#25234A] transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <a
              href="#about"
              className="hover:text-[#25234A] transition-colors whitespace-nowrap shrink-0"
            >
              About
            </a>
            <Link
              to={user ? '/dashboard' : '/login'}
              className="hover:text-[#25234A] transition-colors whitespace-nowrap shrink-0"
            >
              {user ? 'Dashboard' : 'Sign In'}
            </Link>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to={user ? '/training' : '/signup'}
              className="hidden sm:inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5342D6] transition-colors whitespace-nowrap shrink-0"
            >
              {user ? 'Start Training' : 'Get Started'}
            </Link>
            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
              className="md:hidden p-2 rounded-lg text-[#5C597E] hover:bg-[#F7F6FF]"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileNavOpen && (
          <div className="md:hidden border-t border-[#E6E3FA] bg-white px-4 py-4 space-y-2">
            <a
              href="#features"
              onClick={() => setMobileNavOpen(false)}
              className="block py-2 text-sm font-medium text-[#25234A]"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileNavOpen(false)}
              className="block py-2 text-sm font-medium text-[#25234A]"
            >
              How It Works
            </a>
            <a
              href="#about"
              onClick={() => setMobileNavOpen(false)}
              className="block py-2 text-sm font-medium text-[#25234A]"
            >
              About
            </a>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                to={user ? '/dashboard' : '/login'}
                className="w-full text-center rounded-lg border border-[#E6E3FA] px-4 py-2.5 text-sm font-medium text-[#25234A]"
              >
                {user ? 'Open Dashboard' : 'Sign In'}
              </Link>
              <Link
                to={user ? '/training' : '/signup'}
                className="w-full text-center rounded-lg bg-[#6554E8] px-4 py-2.5 text-sm font-semibold text-white"
              >
                {user ? 'Start Training' : 'Get Started'}
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 lg:pt-20 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-xs font-medium text-[#6554E8] tracking-wide">
              Accessible Visual Training · Standard Webcam Ready
            </p>
            <h1
              className="mt-4 font-display font-bold tracking-tight text-[#25234A] leading-[1.1]"
              style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', textWrap: 'balance' }}
            >
              Train Your Vision, One Look at a Time
            </h1>
            <p className="mt-5 text-base sm:text-lg text-[#5C597E] leading-relaxed max-w-xl">
              AmblyoCare brings interactive gaze-guided visual exercises, personalized webcam
              calibration, adaptive difficulty, and clear session analytics to any computer—helping
              people with amblyopia practice consistently from home without specialized headsets.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to={user ? '/dashboard' : '/signup'}
                className="inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-6 py-3 text-sm font-semibold text-white hover:bg-[#5342D6] transition-colors whitespace-nowrap"
              >
                {user ? 'Go to Dashboard' : 'Get Started Free'}
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              {!user && (
                <Link
                  to="/login"
                  className="inline-flex items-center rounded-lg border border-[#E6E3FA] bg-white px-5 py-3 text-sm font-medium text-[#25234A] hover:bg-[#F0EDFF]/60 transition-colors whitespace-nowrap"
                >
                  Sign In to Account
                </Link>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-[#E6E3FA] flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#5C597E]">
              <span>Works with built-in laptop webcams</span>
              <span aria-hidden="true">·</span>
              <span>9-point personalized gaze calibration</span>
              <span aria-hidden="true">·</span>
              <span>Private browser-side video processing</span>
            </div>
          </div>

          <div className="lg:col-span-6 flex">
            <div className="w-full rounded-2xl border border-[#E6E3FA] bg-white p-3 flex flex-col justify-between">
              {!heroImgFailed ? (
                <img
                  src={HERO_IMG}
                  alt="Person sitting comfortably at a desk using a laptop computer for AmblyoCare visual focus training"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full min-h-[260px] max-h-[420px] object-cover rounded-xl"
                />
              ) : (
                <div className="w-full min-h-[280px] rounded-xl bg-[#F0EDFF] flex flex-col items-center justify-center p-8 text-center">
                  <Eye className="w-12 h-12 text-[#6554E8] mb-3" />
                  <p className="font-display font-semibold text-[#25234A]">
                    Webcam-Guided Visual Focus Training
                  </p>
                </div>
              )}
              <div className="px-3 pt-3 pb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[#5C597E]">
                <span>Real-time MediaPipe iris & eye landmark detection</span>
                <span className="font-mono text-[#6554E8] tabular-nums">3 Training Modes</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-white border-y border-[#E6E3FA] py-16 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2
              className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#25234A]"
              style={{ textWrap: 'balance' }}
            >
              Designed for consistent, accessible visual practice
            </h2>
            <p className="mt-3 text-base text-[#5C597E] leading-relaxed">
              Every module in AmblyoCare connects real camera input with measurable session data and
              gentle difficulty adjustments.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-12 gap-6">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <article
                  key={feature.number}
                  className={`${
                    feature.wide ? 'md:col-span-7' : 'md:col-span-5'
                  } rounded-2xl border border-[#E6E3FA] bg-[#F7F6FF]/55 p-6 sm:p-7 flex flex-col justify-between`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-mono text-xs font-semibold text-[#6554E8]">
                        {feature.number}.
                      </span>
                      <div className="w-9 h-9 rounded-lg bg-white border border-[#E6E3FA] flex items-center justify-center text-[#6554E8]">
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </div>
                    </div>
                    <h3 className="mt-4 font-display text-lg font-bold text-[#25234A]">
                      {feature.title}
                    </h3>
                    <p className="mt-2.5 text-sm text-[#5C597E] leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="max-w-2xl">
          <h2
            className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#25234A]"
            style={{ textWrap: 'balance' }}
          >
            How AmblyoCare works
          </h2>
          <p className="mt-3 text-base text-[#5C597E] leading-relaxed">
            Four clear steps from initial setup to tracking your accuracy and reaction time over
            time.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((item) => (
            <div
              key={item.step}
              className="rounded-xl border border-[#E6E3FA] bg-white p-6 flex flex-col"
            >
              <span className="font-mono text-sm font-semibold text-[#6554E8]">{item.step}</span>
              <h3 className="mt-3 font-display text-base font-bold text-[#25234A]">{item.title}</h3>
              <p className="mt-2 text-sm text-[#5C597E] leading-relaxed">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About AmblyoCare Section */}
      <section id="about" className="bg-white border-t border-[#E6E3FA] py-16 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-[#E6E3FA] bg-[#F7F6FF] p-3">
                {!aboutImgFailed ? (
                  <img
                    src={ABOUT_IMG}
                    alt="Home study desk with a laptop displaying gentle concentric gaze calibration circles"
                    referrerPolicy="no-referrer"
                    onError={() => setAboutImgFailed(true)}
                    className="w-full aspect-[4/3] object-cover rounded-xl"
                  />
                ) : (
                  <div className="w-full aspect-[4/3] rounded-xl bg-[#F0EDFF] flex items-center justify-center">
                    <Target className="w-12 h-12 text-[#6554E8]" />
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-7">
              <h2
                className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#25234A]"
                style={{ textWrap: 'balance' }}
              >
                About AmblyoCare
              </h2>
              <p className="mt-4 text-base text-[#5C597E] leading-relaxed">
                Amblyopia (often called lazy eye) benefits from regular, engaging visual-motor
                practice alongside clinical care. Dedicated clinic eye-trackers and VR rigs can be
                costly and inaccessible for everyday home practice.
              </p>
              <p className="mt-3 text-base text-[#5C597E] leading-relaxed">
                AmblyoCare bridges that gap using browser-based computer vision. Video frames stay
                on your device while MediaPipe detects eye and iris landmarks, mapping your gaze to
                calm, contrast-friendly exercises that save real performance metrics to your
                personal progress record.
              </p>

              <DisclaimerBanner className="mt-6" />

              <div className="mt-7">
                <Link
                  to={user ? '/calibration' : '/signup'}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#5342D6] transition-colors whitespace-nowrap"
                >
                  {user ? 'Calibrate Your Camera' : 'Create Your Free Account'}
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E6E3FA] bg-[#F7F6FF] py-10">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
            <div className="max-w-md">
              <BrandLogo />
              <p className="mt-3 text-xs text-[#5C597E] leading-relaxed">
                AmblyoCare is an educational and visual-training support platform. It does not
                provide medical diagnosis, clinical-grade oculomotor tracking, or replace prescribed
                amblyopia treatment from a qualified eye-care professional.
              </p>
            </div>

            <div className="flex flex-wrap gap-10 text-sm">
              <div>
                <p className="font-display text-xs font-bold text-[#25234A]">Platform</p>
                <ul className="mt-3 space-y-2 text-xs text-[#5C597E]">
                  <li>
                    <a href="#features" className="hover:text-[#25234A]">
                      Features
                    </a>
                  </li>
                  <li>
                    <a href="#how-it-works" className="hover:text-[#25234A]">
                      How It Works
                    </a>
                  </li>
                  <li>
                    <Link to="/login" className="hover:text-[#25234A]">
                      Sign In
                    </Link>
                  </li>
                  <li>
                    <Link to="/signup" className="hover:text-[#25234A]">
                      Create Account
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <p className="font-display text-xs font-bold text-[#25234A]">Support & Contact</p>
                <ul className="mt-3 space-y-2 text-xs text-[#5C597E]">
                  <li>support@amblyocare.org</li>
                  <li>Privacy: Webcam frames stay local in browser</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-[#E6E3FA] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#5C597E]">
            <span>© {new Date().getFullYear()} AmblyoCare Visual Training Support.</span>
            <span>Built for accessible home visual practice.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
