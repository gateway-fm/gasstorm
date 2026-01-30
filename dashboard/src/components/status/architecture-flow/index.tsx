"use client";

import { useCallback, useState, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTopology } from "./hooks/use-topology";
import {
  LoadGeneratorNode,
  BlockBuilderNode,
  ExecutionNode,
  L1Node,
} from "./nodes";
import { AnimatedEdge } from "./edges";
import { MobileArchitectureView } from "./mobile-view";

// Register custom node types
const nodeTypes: NodeTypes = {
  loadGenerator: LoadGeneratorNode,
  blockBuilder: BlockBuilderNode,
  execution: ExecutionNode,
  l1: L1Node,
};

// Register custom edge types
const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge,
};

// Fit view options
const fitViewOptions = {
  padding: 0.2,
  minZoom: 0.5,
  maxZoom: 1.5,
};

function ArchitectureFlowInner() {
  const { nodes, edges, config } = useTopology();

  // Prevent any interaction callbacks
  const onNodesChange = useCallback(() => {}, []);
  const onEdgesChange = useCallback(() => {}, []);

  // Calculate canvas height based on layout
  const canvasHeight = config.hasBlockBuilder ? 320 : 320;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Architecture</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Mobile: Simplified status cards view */}
        <div className="sm:hidden">
          <MobileArchitectureView config={config} />
        </div>

        {/* Desktop: Full React Flow diagram */}
        <div className="hidden sm:block" style={{ height: canvasHeight }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            fitViewOptions={fitViewOptions}
            // Disable all interactions
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            // Hide minimap and controls
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={16}
              size={1}
              className="!bg-background"
            />
          </ReactFlow>
        </div>
      </CardContent>
    </Card>
  );
}

export function ArchitectureFlow() {
  // Use state to prevent hydration mismatch - React Flow needs client-side rendering
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // During SSR or initial hydration, show a placeholder
  if (!mounted) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Architecture</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden sm:block h-[320px] flex items-center justify-center text-muted-foreground">
            Loading diagram...
          </div>
          <div className="sm:hidden p-4 text-center text-muted-foreground">
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <ReactFlowProvider>
      <ArchitectureFlowInner />
    </ReactFlowProvider>
  );
}

export default ArchitectureFlow;
