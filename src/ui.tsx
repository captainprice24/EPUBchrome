import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./icons";

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const box = ref.current;
    (
      box?.querySelector<HTMLElement>(
        "input:not(:disabled),select:not(:disabled),textarea:not(:disabled),.modal-actions button:not(:disabled)",
      ) || box?.querySelector<HTMLElement>("button")
    )?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && box) {
        const items = Array.from(
          box.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled):not([type=hidden]),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex='0']",
          ),
        );
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      old?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  kind = "primary",
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  kind?: string;
  disabled?: boolean;
}) {
  return (
    <button className={`button ${kind}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
export function ZoomControls({
  zoom,
  onChange,
}: {
  zoom: number;
  onChange: (value: number | ((previous: number) => number)) => void;
}) {
  return (
    <div className="native-zoom">
      <button
        className="icon-btn"
        aria-label="Zoom out"
        onClick={() =>
          onChange((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))
        }
      >
        −
      </button>
      <button
        className="text-button"
        aria-label={`Fit page ${Math.round(zoom * 100)}%`}
        onClick={() => onChange(1)}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        className="icon-btn"
        aria-label="Zoom in"
        onClick={() =>
          onChange((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))
        }
      >
        +
      </button>
    </div>
  );
}
