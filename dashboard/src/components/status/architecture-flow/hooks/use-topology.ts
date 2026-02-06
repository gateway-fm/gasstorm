"use client";

import { useMemo } from "react";
import { useChainStore } from "@/stores/chain-store";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import type {
  ArchitectureNode,
  ArchitectureEdge,
  NodeStatus,
  LoadGeneratorNodeData,
  BlockBuilderNodeData,
  ExecutionNodeData,
  L1NodeData,
  BridgeRelayerNodeData,
  BridgeUINodeData,
  ExecutionLayerType,
} from "../types";
import { getExecutionLayerConfig } from "../constants";

/**
 * Architecture Layout - Clean Three-Column Design
 *
 * ┌───────────────┬─────────────────────┬─────────────────┐
 * │               │   Load Generator    │   Hyperlane     │
 * │   L1 Anvil    │         ↓           │    Relayer      │
 * │  (Settlement) │   Block Builder     │       ↓         │
 * │               │         ↓           │   Bridge UI     │
 * │               │      op-reth        │                 │
 * └───────────────┴─────────────────────┴─────────────────┘
 *
 * Left:   L1 Settlement layer (context)
 * Center: L2 Pipeline (main flow)
 * Right:  Bridge services
 */
const POSITIONS = {
  withBlockBuilder: {
    // CENTER: L2 Pipeline (vertical flow)
    loadGenerator: { x: 280, y: 20 },
    blockBuilder:  { x: 280, y: 140 },
    execution:     { x: 280, y: 280 },

    // LEFT: L1 Settlement (positioned for visual context)
    l1:            { x: 50, y: 140 },

    // RIGHT: Bridge Services
    bridgeRelayer: { x: 520, y: 80 },
    bridgeUI:      { x: 520, y: 230 },
  },
  directSequencer: {
    // CENTER: L2 Pipeline (no block builder)
    loadGenerator: { x: 280, y: 60 },
    execution:     { x: 280, y: 220 },

    // LEFT: L1 Settlement
    l1:            { x: 50, y: 140 },

    // RIGHT: Bridge Services
    bridgeRelayer: { x: 520, y: 80 },
    bridgeUI:      { x: 520, y: 230 },
  },
} as const;

export function useTopology() {
  const l1 = useChainStore((state) => state.l1);
  const l2 = useChainStore((state) => state.l2);
  const builder = useChainStore((state) => state.builder);
  const bridge = useChainStore((state) => state.bridge);

  const loadTestStatus = useGoLoadTestStore((state) => state.status);
  const currentRate = useGoLoadTestStore((state) => state.currentRate);
  const txSentCount = useGoLoadTestStore((state) => state.txSentCount);
  const txPendingCount = useGoLoadTestStore((state) => state.txPendingCount);

  const config = useMemo(() => getExecutionLayerConfig(), []);

  const { nodes, edges } = useMemo(() => {
    const hasBlockBuilder = config.hasBlockBuilder;
    const isTestRunning = loadTestStatus === "running" || loadTestStatus === "initializing";
    const isActive = isTestRunning && currentRate > 0;

    const toStatus = (isOnline: boolean): NodeStatus => isOnline ? "online" : "offline";

    const nodes: ArchitectureNode[] = [];
    const pos = hasBlockBuilder ? POSITIONS.withBlockBuilder : POSITIONS.directSequencer;

    // Load Generator
    nodes.push({
      id: "load-generator",
      type: "loadGenerator",
      position: pos.loadGenerator,
      data: {
        label: "Load Generator",
        status: isTestRunning ? "online" : "unknown",
        tps: currentRate,
        txSent: txSentCount,
        txPending: txPendingCount,
        isRunning: isTestRunning,
      } as LoadGeneratorNodeData,
      draggable: false,
      selectable: false,
    });

    // Block Builder (reth mode only)
    if (hasBlockBuilder) {
      nodes.push({
        id: "block-builder",
        type: "blockBuilder",
        position: POSITIONS.withBlockBuilder.blockBuilder,
        data: {
          label: "Block Builder",
          status: toStatus(builder.isOnline),
          pendingTxCount: builder.pendingTxCount,
          blockTimeMs: builder.blockTimeMs,
        } as BlockBuilderNodeData,
        draggable: false,
        selectable: false,
      });
    }

    // Execution Layer (op-reth)
    nodes.push({
      id: "execution",
      type: "execution",
      position: pos.execution,
      data: {
        label: config.name,
        status: toStatus(l2.isOnline),
        blockNumber: l2.blockNumber,
        chainId: l2.chainId,
        type: config.type as ExecutionLayerType,
      } as ExecutionNodeData,
      draggable: false,
      selectable: false,
    });

    // L1 Anvil
    nodes.push({
      id: "l1",
      type: "l1",
      position: pos.l1,
      data: {
        label: "L1 Anvil",
        status: toStatus(l1.isOnline),
        blockNumber: l1.blockNumber,
      } as L1NodeData,
      draggable: false,
      selectable: false,
    });

    // Bridge Relayer
    nodes.push({
      id: "bridge-relayer",
      type: "bridgeRelayer",
      position: pos.bridgeRelayer,
      data: {
        label: "Hyperlane Relayer",
        status: bridge.relayerOnline ? "online" : "unknown",
        pendingMessages: bridge.pendingMessages,
        messagesRelayed: bridge.messagesRelayed,
        lastRelayTime: bridge.lastRelayTime ?? undefined,
        isOnline: bridge.relayerOnline,
      } as BridgeRelayerNodeData,
      draggable: false,
      selectable: false,
    });

    // Bridge UI
    nodes.push({
      id: "bridge-ui",
      type: "bridgeUI",
      position: pos.bridgeUI,
      data: {
        label: "Bridge UI",
        status: bridge.uiOnline ? "online" : "unknown",
        activeTransfers: bridge.activeTransfers,
        port: 18000,
      } as BridgeUINodeData,
      draggable: false,
      selectable: false,
    });

    // Edges - Core pipeline only for now
    const edges: ArchitectureEdge[] = [];

    if (hasBlockBuilder) {
      // CENTER: Load Generator → Block Builder (down)
      edges.push({
        id: "lg-bb",
        source: "load-generator",
        target: "block-builder",
        type: "animated",
        data: { animated: isActive, tps: currentRate },
      });

      // CENTER: Block Builder → Execution (down)
      edges.push({
        id: "bb-exec",
        source: "block-builder",
        target: "execution",
        type: "animated",
        data: { animated: isActive && builder.isOnline, tps: currentRate },
      });
    } else {
      // DIRECT MODE: Load Generator → Execution (down)
      edges.push({
        id: "lg-exec",
        source: "load-generator",
        target: "execution",
        type: "animated",
        data: { animated: isActive, tps: currentRate },
      });
    }

    // RIGHT: Bridge Relayer → Bridge UI (down)
    edges.push({
      id: "relayer-ui",
      source: "bridge-relayer",
      target: "bridge-ui",
      type: "animated",
      data: { animated: false, tps: 0 },
    });

    return { nodes, edges };
  }, [
    config,
    loadTestStatus,
    currentRate,
    txSentCount,
    txPendingCount,
    builder.isOnline,
    builder.pendingTxCount,
    builder.blockTimeMs,
    bridge.relayerOnline,
    bridge.pendingMessages,
    bridge.messagesRelayed,
    bridge.lastRelayTime,
    bridge.uiOnline,
    bridge.activeTransfers,
    l2.isOnline,
    l2.blockNumber,
    l2.chainId,
    l1.isOnline,
    l1.blockNumber,
  ]);

  return { nodes, edges, config };
}
