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

// Two-tier layout: L1 + Bridge at top, L2 pipeline at bottom
const POSITIONS = {
  withBlockBuilder: {
    // TIER 1 - L1 + Bridge (TOP) - y=50
    l1:            { x: 50, y: 50 },
    bridgeRelayer: { x: 280, y: 50 },
    bridgeUI:      { x: 510, y: 50 },

    // TIER 2 - L2 Pipeline (BOTTOM) - y=300
    loadGenerator: { x: 50, y: 300 },
    blockBuilder:  { x: 280, y: 300 },
    execution:     { x: 510, y: 300 },
  },
  directSequencer: {
    // TIER 1 - L1 + Bridge (TOP)
    l1:            { x: 100, y: 50 },
    bridgeRelayer: { x: 330, y: 50 },
    bridgeUI:      { x: 560, y: 50 },

    // TIER 2 - L2 Pipeline (BOTTOM) - no block builder
    loadGenerator: { x: 150, y: 300 },
    execution:     { x: 450, y: 300 },
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

    // Edges
    const edges: ArchitectureEdge[] = [];

    if (hasBlockBuilder) {
      // Load Generator → Block Builder
      edges.push({
        id: "lg-bb",
        source: "load-generator",
        target: "block-builder",
        targetHandle: "tx-input",
        type: "animated",
        data: { animated: isActive, tps: currentRate, label: "eth_sendRawTx" },
      });

      // Block Builder → Execution (Engine API)
      edges.push({
        id: "bb-exec",
        source: "block-builder",
        target: "execution",
        sourceHandle: "engine-output",
        targetHandle: "engine-input",
        type: "animated",
        data: { animated: isActive && builder.isOnline, tps: currentRate, label: "Engine API" },
      });
    } else {
      // Direct mode: Load Generator → Execution
      edges.push({
        id: "lg-exec",
        source: "load-generator",
        target: "execution",
        targetHandle: "engine-input",
        type: "animated",
        data: { animated: isActive, tps: currentRate, label: "JSON-RPC" },
      });
    }

    // L1 → Bridge Relayer (Hyperlane messaging)
    edges.push({
      id: "l1-relayer",
      source: "l1",
      target: "bridge-relayer",
      sourceHandle: "bridge-output",
      targetHandle: "l1-input",
      type: "animated",
      data: { animated: false, tps: 0, label: "Hyperlane" },
    });

    // Bridge Relayer → Bridge UI (status)
    edges.push({
      id: "relayer-ui",
      source: "bridge-relayer",
      target: "bridge-ui",
      sourceHandle: "ui-output",
      targetHandle: "relayer-input",
      type: "animated",
      data: { animated: false, tps: 0, label: "" },
    });

    // Bridge Relayer → Execution (relay to L2)
    edges.push({
      id: "relayer-exec",
      source: "bridge-relayer",
      target: "execution",
      sourceHandle: "relay-output",
      targetHandle: "bridge-input",
      type: "animated",
      data: { animated: false, tps: 0, label: "Relay" },
    });

    // Execution → L1 (Settlement) - goes UP from execution to L1
    edges.push({
      id: "exec-l1",
      source: "execution",
      target: "l1",
      sourceHandle: "settlement-output",
      targetHandle: "settlement-input",
      type: "animated",
      data: { animated: false, tps: 0, label: "Settlement" },
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
