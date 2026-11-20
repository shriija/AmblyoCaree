import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Crosshair,
  Eye,
  Gamepad2,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Play,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useAuthStore } from '../store/useAuthStore';
import { useGazeStore } from '../store/useGazeStore';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/calibration', label: 'Eye Calibration', icon: Crosshair },
  { to: '/gaze-tracking', label: 'Gaze Tracking', icon: Eye },
  { to: '/training', label: 'Training Games', icon: Gamepad2 },
  { to: '/analytics', label: 'Progress & Analytics', icon: BarChart3 },
  { to: '/profile', label: 'Profile & Settings', icon: Settings },
];

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/calibration': 'Eye Calibration',
  '/gaze-tracking': 'Gaze Tracking',
  '/training': 'Visual Training Activities',
  '/analytics': 'Progress & Analytics',
  '/profile': 'Profile & Settings',
};

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const {
    calibration,
    loadCalibration,
    calibrationLoaded,
    setActiveEyeMode,
    setSelectedCameraId,
  } = useGazeStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!calibrationLoaded) {
      void loadCalibration();
    }
  }, [calibrationLoaded, loadCalibration]);

  useEffect(() => {
    if (user?.preferences) {
      if (!calibration?.activeTrackingMode) {
        setActiveEyeMode(user.preferences.targetEye || 'both');
      }
      if (user.preferences.preferredCameraId) {
        setSelectedCameraId(user.preferences.preferredCameraId);
      }
    }
  }, [user, calibration?.activeTrackingMode, setActiveEyeMode, setSelectedCameraId]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const pageTitle = ROUTE_TITLES[location.pathname] || 'AmblyoCare';
  const initials =
    user?.name
      ?.split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'AC';

  return (
    <div className="min-h-screen bg-[#F7F6FF] text-[#25234A] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 border-r border-[#E6E3FA] bg-white z-30">
        <div className="h-16 px-6 flex items-center border-b border-[#E6E3FA]">
          <Link to="/dashboard" aria-label="AmblyoCare Dashboard">
            <BrandLogo />
          </Link>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Workspace navigation">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#F0EDFF] text-[#6554E8]'
                    : 'text-[#5C597E] hover:bg-[#F7F6FF] hover:text-[#25234A]'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-[#E6E3FA]">
          <div className="flex items-center gap-3 px-2 py-2">
            {user?.profileImage ? (
              <img
                src={user.profileImage}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-cover border border-[#E6E3FA] shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#F0EDFF] text-[#6554E8] font-display text-xs font-bold flex items-center justify-center shrink-0">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#25234A] truncate">{user?.name}</p>
              <p className="text-xs text-[#5C597E] truncate">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg border border-[#E6E3FA] px-3 py-2 text-xs font-medium text-[#5C597E] hover:bg-[#F7F6FF] hover:text-[#25234A] transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-[#25234A]/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-72 bg-white border-r border-[#E6E3FA] flex flex-col z-50">
            <div className="h-16 px-5 flex items-center justify-between border-b border-[#E6E3FA]">
              <BrandLogo />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 rounded-lg text-[#5C597E] hover:bg-[#F7F6FF]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[#F0EDFF] text-[#6554E8]'
                        : 'text-[#5C597E] hover:bg-[#F7F6FF] hover:text-[#25234A]'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="p-4 border-t border-[#E6E3FA]">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#E6E3FA] px-3 py-2.5 text-sm font-medium text-[#5C597E] hover:bg-[#F7F6FF]"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-sm border-b border-[#E6E3FA] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-lg text-[#5C597E] hover:bg-[#F7F6FF]"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display text-base sm:text-lg font-bold text-[#25234A] truncate">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {location.pathname !== '/training' && (
              <Link
                to="/training"
                className="inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#5342D6] transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                Start Training
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1280px] w-full mx-auto">
          <Outlet />
        </main>

        <footer className="border-t border-[#E6E3FA] bg-white/70 px-4 sm:px-6 lg:px-8 py-4 text-xs text-[#5C597E]">
          <div className="max-w-[1280px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>AmblyoCare · Adaptive Visual Training Support Platform</span>
            <span>
              Educational support tool only — not a substitute for professional eye care or medical
              diagnosis.
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};
