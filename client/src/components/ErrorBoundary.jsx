import { Component } from 'react';

/** Shows a recoverable message instead of a blank screen if a page crashes. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Page crashed', error, info.componentStack);
  }

  // Navigating away clears the error without remounting healthy layouts.
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-[60vh] place-items-center px-6 py-16 text-center">
        <div>
          <p className="font-display text-2xl font-bold">Something went wrong on this page</p>
          <p className="mt-2 text-stone-600">Reloading usually fixes it. Nothing you entered has been lost on our side.</p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => window.location.reload()} className="rounded-full bg-ember-500 px-5 py-2.5 text-sm font-semibold text-white">
              Reload
            </button>
            <a href="/" className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-stone-300">
              Home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
