/**
 * Types for the Architecture Flow diagram
 */

import type { Node, Edge } from "@xyflow/react";

// Execution layer types
export type ExecutionLayerType = "reth" | "op-reth" | "gravity-reth" | "cdk-erigon";

// Node status indicator
export type NodeStatus = "online" | "offline" | "unknown";

// Base data for all nodes
export interface BaseNodeData extends Record<string, unknown> {
  label: string;
  status: NodeStatus;
}

// Load Generator node data
export interface LoadGeneratorNodeData extends BaseNodeData {
  tps: number;
  txSent: number;
  txPending: number;
  isRunning: boolean;
}

// Block Builder node data
export interface BlockBuilderNodeData extends BaseNodeData {
  pendingTxCount: number;
  blockTimeMs: number;
  blocksBuilt?: number;
}

// Execution Layer node data
export interface ExecutionNodeData extends BaseNodeData {
  blockNumber: number;
  chainId: number;
  type: ExecutionLayerType;
}

// L1 node data
export interface L1NodeData extends BaseNodeData {
  blockNumber: number;
}

// Bridge Relayer node data
export interface BridgeRelayerNodeData extends BaseNodeData {
  pendingMessages: number;
  messagesRelayed: number;
  lastRelayTime?: string;
  isOnline: boolean;
}

// Bridge UI node data
export interface BridgeUINodeData extends BaseNodeData {
  activeTransfers: number;
  port: number;
}

// Typed nodes using xyflow Node type
export type LoadGeneratorNode = Node<LoadGeneratorNodeData, "loadGenerator">;
export type BlockBuilderNode = Node<BlockBuilderNodeData, "blockBuilder">;
export type ExecutionNode = Node<ExecutionNodeData, "execution">;
export type L1Node = Node<L1NodeData, "l1">;
export type BridgeRelayerNode = Node<BridgeRelayerNodeData, "bridgeRelayer">;
export type BridgeUINode = Node<BridgeUINodeData, "bridgeUI">;

export type ArchitectureNode =
  | LoadGeneratorNode
  | BlockBuilderNode
  | ExecutionNode
  | L1Node
  | BridgeRelayerNode
  | BridgeUINode;

// Edge data for animation state
export interface AnimatedEdgeData extends Record<string, unknown> {
  animated: boolean;
  tps?: number; // Used to control animation speed
  label?: string;
}

// Full edge type with our custom data
export type ArchitectureEdge = Edge<AnimatedEdgeData, "animated">;

// Execution layer configuration
export interface ExecutionLayerConfig {
  type: ExecutionLayerType;
  name: string;
  hasBlockBuilder: boolean; // true = external block builder, false = direct sequencer
  supportsPreconfirmations: boolean;
}
