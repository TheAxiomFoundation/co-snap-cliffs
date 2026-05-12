import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: "#faf9f6", elevated: "#ffffff" },
        ink: { DEFAULT: "#1c1917", secondary: "#57534e", muted: "#78716c" },
        rule: { DEFAULT: "#e7e5e4", subtle: "#f5f5f4", strong: "#78716c" },
        accent: { DEFAULT: "#92400e", hover: "#7c2d12", light: "rgba(146,64,14,0.06)" },
        success: "#166534",
        warning: "#92400e",
        error: "#991b1b",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "Menlo", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
    },
  },
  plugins: [],
} satisfies Config;
