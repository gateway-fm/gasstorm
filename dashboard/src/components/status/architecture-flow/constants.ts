/**
 * Constants for the Architecture Flow diagram
 */

import type { ExecutionLayerConfig, ExecutionLayerType } from "./types";

// Node positions for layouts
export const NODE_POSITIONS = {
  // Layout with block builder (reth mode)
  withBlockBuilder: {
    loadGenerator: { x: 50, y: 100 },
    blockBuilder: { x: 250, y: 100 },
    execution: { x: 450, y: 100 },
    l1: { x: 450, y: 250 },
  },
  // Direct sequencer layout (gravity-reth, cdk-erigon)
  directSequencer: {
    loadGenerator: { x: 100, y: 100 },
    execution: { x: 350, y: 100 },
    l1: { x: 350, y: 250 },
  },
} as const;

// Node dimensions
export const NODE_DIMENSIONS = {
  width: 160,
  height: 80,
} as const;

// Colors for nodes and edges
export const COLORS = {
  loadGenerator: {
    bg: "hsl(var(--chart-1))",
    border: "hsl(var(--chart-1))",
  },
  blockBuilder: {
    bg: "hsl(var(--chart-2))",
    border: "hsl(var(--chart-2))",
  },
  execution: {
    bg: "hsl(var(--chart-3))",
    border: "hsl(var(--chart-3))",
  },
  l1: {
    bg: "hsl(var(--chart-4))",
    border: "hsl(var(--chart-4))",
  },
  status: {
    online: "rgb(34, 197, 94)", // green-500
    offline: "rgb(239, 68, 68)", // red-500
    unknown: "rgb(156, 163, 175)", // gray-400
  },
  edge: {
    active: "hsl(var(--primary))",
    inactive: "hsl(var(--muted-foreground))",
  },
} as const;

// Execution layer configurations
export const EXECUTION_LAYER_CONFIGS: Record<ExecutionLayerType, ExecutionLayerConfig> = {
  reth: {
    type: "reth",
    name: "op-reth",
    hasBlockBuilder: true,
    supportsPreconfirmations: true,
  },
  "op-reth": {
    type: "op-reth",
    name: "op-reth",
    hasBlockBuilder: true,
    supportsPreconfirmations: true,
  },
  "gravity-reth": {
    type: "gravity-reth",
    name: "gravity-reth",
    hasBlockBuilder: false,
    supportsPreconfirmations: false,
  },
  "cdk-erigon": {
    type: "cdk-erigon",
    name: "cdk-erigon",
    hasBlockBuilder: false,
    supportsPreconfirmations: false,
  },
} as const;

/**
 * Get execution layer config from environment or default to reth
 */
export function getExecutionLayerConfig(): ExecutionLayerConfig {
  // In the browser, we can try to detect from environment
  // For now, default to reth mode (with block builder)
  const envLayer = typeof window !== "undefined"
    ? (window as unknown as { __EXECUTION_LAYER__?: string }).__EXECUTION_LAYER__
    : undefined;

  const layerType = (envLayer || "reth") as ExecutionLayerType;
  return EXECUTION_LAYER_CONFIGS[layerType] || EXECUTION_LAYER_CONFIGS.reth;
}

// Animation settings
export const ANIMATION = {
  // Base duration in seconds for edge particle animation
  baseDuration: 2,
  // Minimum duration (fastest animation at high TPS)
  minDuration: 0.3,
  // TPS threshold where animation reaches max speed
  maxTpsThreshold: 1000,
} as const;
