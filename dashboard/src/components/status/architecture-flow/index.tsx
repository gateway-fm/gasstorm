"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
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
  BridgeRelayerNode,
  BridgeUINode,
} from "./nodes";
import { AnimatedEdge } from "./edges";
import { MobileArchitectureView } from "./mobile-view";

const nodeTypes: NodeTypes = {
  loadGenerator: LoadGeneratorNode,
  blockBuilder: BlockBuilderNode,
  execution: ExecutionNode,
  l1: L1Node,
  bridgeRelayer: BridgeRelayerNode,
  bridgeUI: BridgeUINode,
};

const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge,
};

const fitViewOptions = {
  padding: 0.15,
  minZoom: 0.6,
  maxZoom: 1.0,
};

function ArchitectureFlowInner() {
  const { nodes, edges, config } = useTopology();

  const onNodesChange = useCallback(() => {}, []);
  const onEdgesChange = useCallback(() => {}, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">System Architecture</CardTitle>
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
            {config.name}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0 relative">
        {/* Column Labels - positioned to match the three-column layout */}
        <div className="absolute top-2 left-0 right-0 pointer-events-none z-10">
          <div className="flex justify-between px-8">
            <div className="text-[9px] text-muted-foreground/40 font-medium uppercase tracking-wider">
              L1
            </div>
            <div className="text-[9px] text-muted-foreground/40 font-medium uppercase tracking-wider">
              L2 Pipeline
            </div>
            <div className="text-[9px] text-muted-foreground/40 font-medium uppercase tracking-wider">
              Bridge
            </div>
          </div>
        </div>

        {/* Mobile view */}
        <div className="sm:hidden">
          <MobileArchitectureView config={config} />
        </div>

        {/* Desktop diagram */}
        <div className="hidden sm:block h-[600px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            fitViewOptions={fitViewOptions}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={true}
            zoomOnScroll={true}
            zoomOnPinch={true}
            zoomOnDoubleClick={false}
            preventScrolling={true}
            minZoom={0.5}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              className="!bg-background"
              color="hsl(var(--muted-foreground) / 0.1)"
            />
            <Controls
              showInteractive={false}
              className="!bg-card/90 !border-border/30 !shadow-md [&>button]:!bg-card [&>button]:!border-border/30 [&>button:hover]:!bg-muted"
            />
          </ReactFlow>
        </div>
      </CardContent>
    </Card>
  );
}

// Client-side mount detection without useEffect setState
const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ArchitectureFlow() {
  const mounted = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

  if (!mounted) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">System Architecture</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden sm:flex h-[520px] items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
              <span className="text-xs">Loading...</span>
            </div>
          </div>
          <div className="sm:hidden p-4 text-center text-muted-foreground text-sm">
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
