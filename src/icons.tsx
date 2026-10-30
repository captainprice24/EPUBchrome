import type { CSSProperties } from "react";
const paths: Record<string, string[]> = {
  expand: ["M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"],
  contract: ["M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"],
  book: [
    "M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z",
    "M13 7a3 3 0 0 1 3-3h5v15h-4a4 4 0 0 0-4 2",
  ],
  grid: ["M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"],
  bookmark: ["M6 3h12v18l-6-4-6 4z"],
  highlight: ["m14 3 7 7-9 9H5v-7z", "m3 21 3-3M12 5l7 7"],
  plus: ["M12 5v14M5 12h14"],
  search: ["M21 21l-5-5", "M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0"],
  arrow: ["M19 12H5m6-6-6 6 6 6"],
  next: ["m9 5 7 7-7 7"],
  prev: ["m15 5-7 7 7 7"],
  close: ["m6 6 12 12M6 18 18 6"],
  drive: ["m9 3 6 0 7 12-3 6H5l-3-6z", "m9 3 7 12H2m13-12L5 21m11-6 3 6"],
  upload: ["M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"],
  more: ["M5 12h.01M12 12h.01M19 12h.01"],
  check: ["m5 12 4 4L19 6"],
  print: ["M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6z"],
  scan: ["M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 9h10M7 13h10M7 17h6"],
  sun: [
    "M12 3V1m0 22v-2M3 12H1m22 0h-2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2",
    "M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  ],
  moon: ["M21 13A9 9 0 0 1 11 3 9 9 0 1 0 21 13"],
  list: ["M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"],
  trash: ["M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"],
  download: ["M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"],
  leaf: ["M20 3C10 2 2 7 5 15c7 6 16-1 15-12zM4 21 16 9"],
  info: ["M12 11v6m0-10h.01", "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0"],
  settings: ["M4 7h16M4 17h16", "M8 4v6M16 14v6"],
};
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {(paths[name] || paths.book)!.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}
