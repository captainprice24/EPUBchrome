import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import { ErrorBoundary } from "../../src/ErrorBoundary";
import "../../src/style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
