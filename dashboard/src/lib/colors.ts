/**
 * Theme colors for use in JavaScript contexts (e.g., Recharts)
 *
 * These values should match the CSS variables in globals.css.
 * To reskin the app, update both this file and globals.css.
 *
 * Note: Recharts and other SVG-based libraries need actual color strings,
 * not CSS variables. This file provides those values.
 */

// Primary brand colors (Gateway purple gradient)
export const colors = {
  // Primary purple gradient
  primary: "#8950FA",
  primaryLight: "#A478FC",
  primaryLighter: "#C4A8FD",
  primaryDark: "#6B3DD4",

  // Status colors
  success: "#22C55E",
  successLight: "#4ADE80",
  successLighter: "#86EFAC",

  warning: "#EAB308",
  warningLight: "#FEF08A",

  destructive: "#EF4444",
  destructiveLight: "#DC2626",
  destructiveDark: "#B91C1C",

  info: "#3B82F6",
  infoLight: "#60A5FA",

  // Neutral colors for chart elements
  grid: "#E2E8F0",
  axis: "#6B7280",
  border: "#E2E8F0",
  background: "#FFFFFF",

  // Orange for execution layer badges
  orange: "#F97316",
  orangeLight: "#FB923C",
} as const;

// Chart-specific color arrays that match the theme
export const chartColors = {
  // Purple gradient for primary metrics (MGas/s, throughput)
  primary: [colors.primary, colors.primaryLight, colors.primaryLighter],

  // Green gradient for success metrics (preconfirmations)
  success: [colors.success, colors.successLight, colors.successLighter],

  // Purple gradient for confirmation latency
  confirmation: [colors.primaryDark, colors.primary, colors.primaryLight],

  // Green to red gradient for tip distribution
  tipGradient: [
    colors.success,
    colors.successLight,
    colors.successLighter,
    colors.warning,
    colors.orange,
    colors.destructive,
    colors.destructiveLight,
    colors.destructiveDark,
  ],
} as const;

// Helper to get CSS variable value at runtime (for dynamic theming)
export function getCssVariable(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
