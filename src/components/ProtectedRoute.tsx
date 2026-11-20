import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, initialized } = useAuthStore();
  const location = useLocation();

  if (!initialized) {
    return (
      <div className="min-h-screen bg-[#F7F6FF] flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-[#E6E3FA] bg-white p-6 text-center">
          <div className="w-8 h-8 border-2 border-[#6554E8] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-[#25234A]">Loading your AmblyoCare workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
};
