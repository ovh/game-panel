import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level error boundary. Catches render-time exceptions anywhere in the tree
 * so a single bad payload cannot white-screen the whole panel, and offers a
 * recoverable fallback. `componentDidCatch` is the single hook to wire to an
 * error-reporting service (e.g. Sentry) when observability is added.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Hook point for telemetry/RUM (e.g. Sentry.captureException(error, info)).
    if (import.meta.env.DEV) {
      console.error('Unhandled render error:', error, info.componentStack);
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a] p-6 text-gray-200">
        <div className="max-w-md w-full rounded-lg border border-gray-700 bg-[#111827] p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle className="h-6 w-6 text-red-400" />
          </div>
          <h1 className="mb-2 text-lg font-semibold text-white">Something went wrong</h1>
          <p className="mb-5 text-sm text-gray-400">
            The interface hit an unexpected error. Reloading usually fixes it. If the problem
            persists, contact your administrator.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mb-5 max-h-40 overflow-auto rounded bg-black/40 p-3 text-left text-xs text-red-300">
              {this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center justify-center rounded-lg bg-[var(--gp-ods-accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
