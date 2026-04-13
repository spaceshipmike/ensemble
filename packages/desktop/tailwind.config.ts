import type { Config } from "tailwindcss";

export default {
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  theme: {
    fontSize: {
      caption: ["0.6875rem", { lineHeight: "1rem" }],       // 11px — timestamps, badges
      secondary: ["0.75rem", { lineHeight: "1.125rem" }],   // 12px — muted text, labels
      body: ["0.8125rem", { lineHeight: "1.25rem" }],       // 13px — default UI text
      subhead: ["0.9375rem", { lineHeight: "1.375rem" }],   // 15px — section titles
      display: ["1.25rem", { lineHeight: "1.625rem" }],     // 20px — page-level numbers
    },
    extend: {
      fontFamily: {
        mono: ['"Commit Mono"', '"SF Mono"', "ui-monospace", '"JetBrains Mono"', "Menlo", "Consolas", "monospace"],
      },
      colors: {
        // TE patch-bay palette — remapped from the legacy dark names so existing
        // Tailwind classes across the app flip to bone/graphite automatically.
        sidebar: {
          bg: "#f5f4f0",        // bone
          hover: "#ecebe6",     // bone-sunk
          active: "#e4e3de",    // slightly deeper
          text: "#1a1a1a",      // graphite
          muted: "#8a8a86",     // ink-3
        },
        surface: {
          bg: "#f5f4f0",                    // bone
          card: "#f5f4f0",                  // no card fill — hairlines only
          border: "rgba(26, 26, 26, 0.08)", // hairline
        },
        accent: {
          DEFAULT: "#1a1a1a", // graphite — TE solid buttons are black on bone
          hover: "#000000",
        },
        status: {
          ok: "#2f8f4a",    // sync
          warn: "#ff5a1f",  // signal
          error: "#d93025", // tape
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
