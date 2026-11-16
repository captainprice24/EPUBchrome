import { useEffect, useRef, useState } from "react";
import { readChoice, writePreference, type InterfaceTheme } from "./prefs";
import type { ReadingMode, ReadingSettings, ReadingTheme } from "./reader";

/** Reading and appearance preferences, kept in localStorage. Key names are
 * what existing installations have stored; they must not change. */
export function usePreferences() {
  const [font, setFont] = useState(() =>
    Math.max(
      14,
      Math.min(36, Number(localStorage.getItem("folio-font")) || 22),
    ),
  );
  const [mode, setMode] = useState<ReadingMode>(() =>
    localStorage.getItem("folio-reading-mode") === "vertical"
      ? "vertical"
      : "horizontal",
  );
  const [fontChoice, setFontChoice] = useState<ReadingSettings["font"]>(() => {
    const f = localStorage.getItem("folio-reading-font");
    return f === "classic" || f === "modern" || f === "literary"
      ? f
      : "publisher";
  });
  const [spacing, setSpacing] = useState(() => {
    const n = Number(localStorage.getItem("folio-spacing"));
    return [1.4, 1.7, 2].includes(n) ? n : 1.7;
  });
  const [margin, setMargin] = useState<ReadingSettings["margin"]>(() => {
    const v = localStorage.getItem("folio-margin");
    return v === "narrow" || v === "wide" ? v : "comfortable";
  });
  const [theme, setTheme] = useState<ReadingTheme>(() => {
    const t = localStorage.getItem("folio-theme");
    return t === "paper" || t === "sepia" || t === "night"
      ? t
      : localStorage.getItem("folio-dark") === "true"
        ? "night"
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "night"
          : "paper";
  });
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [interfaceTheme, setInterfaceTheme] = useState<InterfaceTheme>(() =>
    readChoice(
      "folio-interface",
      ["system", "pages", "light", "dark"] as const,
      "system",
    ),
  );
  const interfaceDark =
    interfaceTheme === "dark" ||
    (interfaceTheme === "system" && systemDark) ||
    (interfaceTheme === "pages" && theme === "night");
  const [spread, setSpread] = useState(
    () =>
      readChoice("folio-spread", ["true", "false"] as const, "false") ===
      "true",
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const change = () => setSystemDark(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const lastLightTheme = useRef<ReadingTheme>(
    localStorage.getItem("folio-light-theme") === "sepia" ? "sepia" : "paper",
  );
  useEffect(() => {
    writePreference("folio-font", String(font));
    if (theme !== "night") {
      lastLightTheme.current = theme;
      writePreference("folio-light-theme", theme);
    }
    writePreference("folio-reading-mode", mode);
    writePreference("folio-reading-font", fontChoice);
    writePreference("folio-spacing", String(spacing));
    writePreference("folio-margin", margin);
    writePreference("folio-theme", theme);
    writePreference("folio-interface", interfaceTheme);
    writePreference("folio-spread", String(spread));
  }, [font, mode, fontChoice, spacing, margin, theme, interfaceTheme, spread]);
  const reset = () => {
    setFont(22);
    setMode("horizontal");
    setFontChoice("publisher");
    setSpacing(1.7);
    setMargin("comfortable");
    setTheme("paper");
    setSpread(false);
  };
  return {
    font,
    setFont,
    mode,
    setMode,
    fontChoice,
    setFontChoice,
    spacing,
    setSpacing,
    margin,
    setMargin,
    theme,
    setTheme,
    interfaceTheme,
    setInterfaceTheme,
    interfaceDark,
    spread,
    setSpread,
    lastLightTheme,
    reset,
  };
}
export type Preferences = ReturnType<typeof usePreferences>;
