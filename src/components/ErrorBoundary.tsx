import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected interface error occurred.',
    };
  }

  componentDidCatch(error: Error): void {
    console.error('[AmblyoCare UI Error]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F6FF] flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-[#E6E3FA] bg-white p-7 text-center">
            <AlertCircle className="w-9 h-9 text-[#E76B75] mx-auto mb-3" aria-hidden="true" />
            <h1 className="font-display text-lg font-bold text-[#25234A]">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-[#5C597E]">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#6554E8] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#5342D6]"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Reload AmblyoCare
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
