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
  ExecutionLayerType,
} from "../types";
import { NODE_POSITIONS, getExecutionLayerConfig } from "../constants";

/**
 * Hook that derives the React Flow nodes and edges from store state
 */
export function useTopology() {
  // Get chain status
  const l1 = useChainStore((state) => state.l1);
  const l2 = useChainStore((state) => state.l2);
  const builder = useChainStore((state) => state.builder);

  // Get load test status
  const loadTestStatus = useGoLoadTestStore((state) => state.status);
  const currentRate = useGoLoadTestStore((state) => state.currentRate);
  const txSentCount = useGoLoadTestStore((state) => state.txSentCount);
  const txPendingCount = useGoLoadTestStore((state) => state.txPendingCount);

  // Determine execution layer config
  const config = useMemo(() => getExecutionLayerConfig(), []);

  // Derive nodes and edges
  const { nodes, edges } = useMemo(() => {
    const hasBlockBuilder = config.hasBlockBuilder;

    const isTestRunning =
      loadTestStatus === "running" || loadTestStatus === "initializing";
    const isActive = isTestRunning && currentRate > 0;

    // Helper to convert boolean to status
    const toStatus = (isOnline: boolean): NodeStatus =>
      isOnline ? "online" : "offline";

    // Build nodes array
    const nodes: ArchitectureNode[] = [];

    // Use appropriate layout based on whether block builder is present
    const withBbPositions = NODE_POSITIONS.withBlockBuilder;
    const directPositions = NODE_POSITIONS.directSequencer;

    // Load Generator node
    const loadGenData: LoadGeneratorNodeData = {
      label: "Load Generator",
      status: isTestRunning ? "online" : "unknown",
      tps: currentRate,
      txSent: txSentCount,
      txPending: txPendingCount,
      isRunning: isTestRunning,
    };
    nodes.push({
      id: "load-generator",
      type: "loadGenerator",
      position: hasBlockBuilder ? withBbPositions.loadGenerator : directPositions.loadGenerator,
      data: loadGenData,
      draggable: false,
      selectable: false,
    });

    // Block Builder node (only in reth mode)
    if (hasBlockBuilder) {
      const builderData: BlockBuilderNodeData = {
        label: "Block Builder",
        status: toStatus(builder.isOnline),
        pendingTxCount: builder.pendingTxCount,
        blockTimeMs: builder.blockTimeMs,
      };
      nodes.push({
        id: "block-builder",
        type: "blockBuilder",
        position: withBbPositions.blockBuilder,
        data: builderData,
        draggable: false,
        selectable: false,
      });
    }

    // Execution Layer node
    const executionData: ExecutionNodeData = {
      label: config.name,
      status: toStatus(l2.isOnline),
      blockNumber: l2.blockNumber,
      chainId: l2.chainId,
      type: config.type as ExecutionLayerType,
    };
    nodes.push({
      id: "execution",
      type: "execution",
      position: hasBlockBuilder ? withBbPositions.execution : directPositions.execution,
      data: executionData,
      draggable: false,
      selectable: false,
    });

    // L1 node
    const l1Data: L1NodeData = {
      label: "L1 Anvil",
      status: toStatus(l1.isOnline),
      blockNumber: l1.blockNumber,
    };
    nodes.push({
      id: "l1",
      type: "l1",
      position: hasBlockBuilder ? withBbPositions.l1 : directPositions.l1,
      data: l1Data,
      draggable: false,
      selectable: false,
    });

    // Build edges array
    const edges: ArchitectureEdge[] = [];

    if (hasBlockBuilder) {
      // Load Generator → Block Builder
      edges.push({
        id: "lg-to-bb",
        source: "load-generator",
        target: "block-builder",
        type: "animated",
        data: {
          animated: isActive,
          tps: currentRate,
          label: "TX",
        },
      });

      // Block Builder → Execution
      edges.push({
        id: "bb-to-exec",
        source: "block-builder",
        target: "execution",
        type: "animated",
        data: {
          animated: isActive && builder.isOnline,
          tps: currentRate,
          label: "Engine API",
        },
      });
    } else {
      // Direct: Load Generator → Execution
      edges.push({
        id: "lg-to-exec",
        source: "load-generator",
        target: "execution",
        type: "animated",
        data: {
          animated: isActive,
          tps: currentRate,
          label: "TX",
        },
      });
    }

    // Execution → L1 (always present, for future settlement)
    edges.push({
      id: "exec-to-l1",
      source: "execution",
      target: "l1",
      sourceHandle: undefined,
      targetHandle: undefined,
      type: "animated",
      data: {
        animated: false, // L1 settlement not implemented yet
        tps: 0,
        label: "Settlement",
      },
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
    l2.isOnline,
    l2.blockNumber,
    l2.chainId,
    l1.isOnline,
    l1.blockNumber,
  ]);

  return { nodes, edges, config };
}
