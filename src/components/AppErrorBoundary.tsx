import React from 'react';

type Props = { children: React.ReactNode; title?: string };
type State = { hasError: boolean };

/** Prevent an uncaught React render error from turning the entire app into a blank white screen. */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('COTRIX UI render error:', error, info.componentStack);
  }

  private recover = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-slate-50 p-5 flex items-center justify-center" role="alert">
          <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-bold text-slate-900">This screen could not be displayed</h1>
            <p className="mt-2 text-sm text-slate-600">A display error occurred. Try reopening this screen. Your saved database records have not been intentionally changed by this recovery screen.</p>
            <button type="button" onClick={this.recover} className="mt-4 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Try again</button>
            <button type="button" onClick={() => window.location.reload()} className="ml-2 mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Reload app</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
