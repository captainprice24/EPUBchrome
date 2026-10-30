import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app empty" role="alert">
        <h1>Folio could not display this view.</h1>
        <p>
          Your saved library is still in this browser. Reload to return to it.
        </p>
        <button className="button primary" onClick={() => location.reload()}>
          Return to library
        </button>
      </main>
    );
  }
}
