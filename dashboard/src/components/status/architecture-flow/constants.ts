/**
 * Constants for the Architecture Flow diagram
 *
 * Layout Design (Three-Column):
 * ┌─────────────────┬────────────────────────┬─────────────────┐
 * │                 │   Load Generator        │  Hyperlane      │
 * │   L1 Anvil      │        ↓                │    Relayer      │
 * │ (Settlement)    │   Block Builder         │       ↓         │
 * │                 │        ↓                │   Bridge UI     │
 * │                 │   op-reth/L2           │                 │
 * └─────────────────┴────────────────────────┴─────────────────┘
 *
 * Left Column:  L1 Settlement Layer (connected via Settlement edge)
 * Center:       L2 Pipeline (Load Gen → Block Builder → Execution)
 * Right Column: Bridge Services (Relayer → UI)
 */

import type { ExecutionLayerConfig, ExecutionLayerType } from "./types";

// Node positions for layouts - Three column design
export const NODE_POSITIONS = {
  // Layout with block builder (reth mode) - Three column layout
  withBlockBuilder: {
    // LEFT: L1 Settlement Layer
    l1: { x: 30, y: 400 },
    // CENTER: L2 Pipeline (vertical flow)
    loadGenerator: { x: 280, y: 80 },
    blockBuilder: { x: 280, y: 280 },
    execution: { x: 280, y: 480 },
    bridgeRelayer: { x: 530, y: 200 },
    bridgeUI: { x: 530, y: 400 },
    blobDA: { x: 100, y: 280 },
  },
  // Direct sequencer layout (gravity-reth, cdk-erigon) - Three column layout
  directSequencer: {
    // LEFT: L1 Settlement Layer
    l1: { x: 30, y: 400 },
    // CENTER: L2 Pipeline (no block builder)
    loadGenerator: { x: 280, y: 150 },
    execution: { x: 280, y: 480 },
    // RIGHT: Bridge Services
    bridgeRelayer: { x: 530, y: 200 },
    bridgeUI: { x: 530, y: 400 },
    blobDA: { x: 100, y: 550 },
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
  blobDA: {
    bg: "hsl(var(--chart-5))",
    border: "hsl(var(--chart-5))",
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
