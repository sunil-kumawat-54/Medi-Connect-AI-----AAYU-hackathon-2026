/**
 * Medi Connect AI — Compiled Design Tokens
 * Exported from docs/tokens.json for type-safe UI theme access across Web and Mobile
 */

export const tokens = {
  name: "MediConnect-AI-Design-Tokens",
  version: "1.0.0",
  color: {
    brand: {
      primary: {
        50: "#F0F7FF",
        100: "#E0EFFF",
        200: "#B8DCFF",
        300: "#7AC0FF",
        400: "#349DFF",
        500: "#0284C7",
        600: "#0369A1",
        700: "#075985",
        800: "#0C4A6E",
        900: "#0A2540",
        DEFAULT: "#0284C7",
      },
      teal: {
        50: "#F0FDFA",
        100: "#CCFBF1",
        200: "#99F6E4",
        300: "#5EEAD4",
        400: "#2DD4BF",
        500: "#0D9488",
        600: "#0F766E",
        700: "#115E59",
        800: "#134E4A",
        900: "#042F2E",
        DEFAULT: "#0D9488",
      },
      navy: {
        800: "#0A192F",
        900: "#060F1E",
        950: "#030712",
      },
    },
    semantic: {
      normal: {
        light: "#ECFDF5",
        border: "#A7F3D0",
        text: "#065F46",
        DEFAULT: "#10B981",
      },
      elevated: {
        light: "#FFFBEB",
        border: "#FDE68A",
        text: "#92400E",
        DEFAULT: "#F59E0B",
      },
      critical: {
        light: "#FEF2F2",
        border: "#FECACA",
        text: "#991B1B",
        DEFAULT: "#EF4444",
      },
      info: {
        light: "#EFF6FF",
        border: "#BFDBFE",
        text: "#1E40AF",
        DEFAULT: "#3B82F6",
      },
      neutral: {
        50: "#F8FAFC",
        100: "#F1F5F9",
        200: "#E2E8F0",
        300: "#CBD5E1",
        400: "#94A3B8",
        500: "#64748B",
        600: "#475569",
        700: "#334155",
        800: "#1E293B",
        900: "#0F172A",
      },
    },
    healthcare: {
      aiBadge: {
        bg: "#F5F3FF",
        border: "#DDD6FE",
        text: "#6D28D9",
        icon: "#8B5CF6",
      },
      doctorVerified: {
        bg: "#ECFDF5",
        border: "#6EE7B7",
        text: "#047857",
        badge: "#059669",
      },
      urgentCare: {
        bg: "#7F1D1D",
        bannerText: "#FFFFFF",
        actionBg: "#DC2626",
      },
      boundingBox: {
        highlight: "rgba(14, 165, 233, 0.25)",
        border: "#0284C7",
        activeBorder: "#EF4444",
      },
    },
  },
  typography: {
    fontFamilies: {
      heading: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, sans-serif",
      body: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
      mono: "JetBrains Mono, Menlo, Courier New, monospace",
    },
    fontSize: {
      xs: "0.75rem",
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
      "4xl": "2.25rem",
    },
  },
  spacing: {
    0: "0px",
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
    10: "40px",
    12: "48px",
    16: "64px",
  },
  borderRadius: {
    none: "0px",
    sm: "4px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    "2xl": "24px",
    full: "9999px",
  },
} as const;

export type DesignTokens = typeof tokens;
