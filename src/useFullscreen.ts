import { useCallback, useEffect, useRef, useState } from "react";
export function useReaderFullscreen(active: boolean) {
  const ref = useRef<HTMLDivElement>(null),
    current = useRef(false),
    native = useRef(false);
  const [enabled, setEnabled] = useState(false),
    [fallback, setFallback] = useState(false);
  const exit = useCallback(() => {
    current.current = false;
    setEnabled(false);
    setFallback(false);
    if (document.fullscreenElement === ref.current)
      void document.exitFullscreen().catch(() => {});
    native.current = false;
  }, []);
  const toggle = useCallback(() => {
    if (current.current) {
      exit();
      return;
    }
    current.current = true;
    setEnabled(true);
    setFallback(false);
    if (document.fullscreenEnabled && ref.current?.requestFullscreen)
      void ref.current
        .requestFullscreen()
        .then(() => {
          native.current = true;
        })
        .catch(() => setFallback(true));
    else setFallback(true);
  }, [exit]);
  useEffect(() => {
    const change = () => {
      if (!document.fullscreenElement && native.current) exit();
    };
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        current.current &&
        !document.querySelector('[role="dialog"]')
      )
        exit();
    };
    document.addEventListener("fullscreenchange", change);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("fullscreenchange", change);
      document.removeEventListener("keydown", key);
    };
  }, [exit]);
  useEffect(() => {
    if (!active) exit();
  }, [active, exit]);
  return { ref, enabled, fallback, toggle, exit };
}
