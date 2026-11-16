import { Component, type ReactNode } from "react";
import { version } from "../package.json";

/** Nothing is sent anywhere: the reader has no telemetry. This text lets a
 * person attach the relevant facts to a bug report themselves. */
async function diagnostics(error: unknown) {
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  const megabytes = (n?: number) =>
    n === undefined ? "unknown" : `${Math.round(n / 1024 ** 2)} MB`;
  return [
    `Folio ${version}`,
    `Context: ${typeof chrome !== "undefined" && chrome.runtime?.id ? "extension" : "web"}`,
    `Browser: ${navigator.userAgent}`,
    `Window: ${window.innerWidth}×${window.innerHeight}`,
    `Storage: ${megabytes(estimate?.usage)} used of ${megabytes(estimate?.quota)}`,
    `Error: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
    error instanceof Error && error.stack
      ? error.stack.split("\n").slice(0, 8).join("\n")
      : "",
  ].join("\n");
}

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; error?: unknown; copied: boolean }
> {
  override state = {
    failed: false,
    error: undefined as unknown,
    copied: false,
  };
  static getDerivedStateFromError(error: unknown) {
    return { failed: true, error };
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
        <p>
          <button
            className="text-button"
            onClick={() =>
              void diagnostics(this.state.error)
                .then((text) => navigator.clipboard.writeText(text))
                .then(() => this.setState({ copied: true }))
                .catch(() => {})
            }
          >
            {this.state.copied
              ? "Copied. Paste it into your report."
              : "Copy details for a bug report"}
          </button>
        </p>
        <p className="fine-print">
          The details list the app version, browser and error. They contain no
          book titles or content, and nothing is sent automatically.
        </p>
      </main>
    );
  }
}
