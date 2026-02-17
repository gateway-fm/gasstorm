"use client";

import React, { useCallback, useEffect, useMemo } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    Connection,
    Edge,
    Node,
    NodeProps,
    addEdge,
    useNodesState,
    useEdgesState,
    MarkerType,
    Position,
    Handle,
    BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useChainStore } from '@/stores/chain-store';

// --- Custom Node Components with Glassmorphism ---

interface GlassNodeProps {
    data: { status?: string; metric?: string };
    label: string;
    icon: string;
    color?: string;
}

const GlassNode = ({ data, label, icon, color = 'blue' }: GlassNodeProps) => {
    const glowColor = {
        blue: 'rgba(59, 130, 246, 0.5)',
        green: 'rgba(16, 185, 129, 0.5)',
        purple: 'rgba(139, 92, 246, 0.5)',
        orange: 'rgba(249, 115, 22, 0.5)',
        red: 'rgba(239, 68, 68, 0.5)',
        gray: 'rgba(156, 163, 175, 0.5)',
    }[color as string] || 'rgba(255, 255, 255, 0.3)';

    return (
        <div className="relative group">
            {/* Glow Effect */}
            <div
                className="absolute -inset-1 rounded-xl blur-lg transition-all duration-300 opacity-40 group-hover:opacity-75"
                style={{ background: glowColor }}
            />

            {/* Glass Container */}
            <div className="relative bg-gray-900/60 backdrop-blur-md border border-white/10 p-5 rounded-xl min-w-[180px] shadow-xl transition-transform duration-300 hover:scale-105">
                <div className="flex flex-col items-center gap-3">
                    <div className="p-3 rounded-full bg-white/5 border border-white/10 text-2xl">
                        {icon}
                    </div>
                    <div className="text-center">
                        <div className="font-bold text-white tracking-wide text-sm">{label}</div>
                        {data.status && (
                            <div className={`text-xs mt-1 ${data.status === 'Active' ? 'text-green-400' : 'text-gray-400'}`}>
                                {data.status}
                            </div>
                        )}
                        {data.metric && (
                            <div className="text-xs font-mono text-gray-300 mt-1 bg-black/30 px-2 py-0.5 rounded">
                                {data.metric}
                            </div>
                        )}
                    </div>
                </div>

                {/* Connection Handles */}
                <Handle type="target" position={Position.Top} className="!bg-white/50 !w-3 !h-3 !border-white/20" />
                <Handle type="source" position={Position.Bottom} className="!bg-white/50 !w-3 !h-3 !border-white/20" />
            </div>
        </div>
    );
};

// Specialized Nodes
type DiagramNodeProps = NodeProps<Node<{ status?: string; metric?: string }>>;
const LoadGeneratorNode = (props: DiagramNodeProps) => <GlassNode data={props.data} label="Load Generator" icon="🚀" color="blue" />;
const BlockBuilderNode = (props: DiagramNodeProps) => <GlassNode data={props.data} label="Block Builder" icon="🧱" color="purple" />;
const ExecutionNode = (props: DiagramNodeProps) => <GlassNode data={props.data} label="Execution (L2)" icon="⚙️" color="green" />;
const L1Node = (props: DiagramNodeProps) => <GlassNode data={props.data} label="L1 Network" icon="⛓️" color="gray" />;
const BridgeRelayerNode = (props: DiagramNodeProps) => <GlassNode data={props.data} label="Bridge Relayer" icon="🌉" color="orange" />;
const BlobDANode = (props: DiagramNodeProps) => <GlassNode data={props.data} label="Blob DA" icon="💾" color="red" />;

const nodeTypes = {
    loadGenerator: LoadGeneratorNode,
    blockBuilder: BlockBuilderNode,
    execution: ExecutionNode,
    l1: L1Node,
    bridgeRelayer: BridgeRelayerNode,
    blobDA: BlobDANode,
};

// --- Initial Data ---

const initialNodes: Node[] = [
    {
        id: 'load-gen',
        type: 'loadGenerator',
        position: { x: 250, y: 0 },
        data: { status: 'Active', metric: '25k TPS' },
    },
    {
        id: 'block-builder',
        type: 'blockBuilder',
        position: { x: 250, y: 200 },
        data: { status: 'Building', metric: '50ms Block' },
    },
    {
        id: 'execution',
        type: 'execution',
        position: { x: 250, y: 400 },
        data: { status: 'Synced', metric: 'Block #12345' },
    },
    {
        id: 'bridge-relayer',
        type: 'bridgeRelayer',
        position: { x: 550, y: 200 },
        data: { status: 'Monitoring', metric: 'Hyperlane' },
    },
    {
        id: 'l1-network',
        type: 'l1',
        position: { x: 550, y: 400 },
        data: { status: 'Finalized' },
    },
    {
        id: 'blob-da',
        type: 'blobDA',
        position: { x: 400, y: 550 },
        data: { status: 'Syncing', metric: 'Blobs' },
    },
];

const initialEdges: Edge[] = [
    {
        id: 'e1-2',
        source: 'load-gen',
        target: 'block-builder',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
    },
    {
        id: 'e2-3',
        source: 'block-builder',
        target: 'execution',
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' },
    },
    {
        id: 'e3-4',
        source: 'execution',
        target: 'l1-network',
        animated: true,
        style: { stroke: '#10b981', strokeWidth: 2, strokeDasharray: '5,5' },
        label: 'Settlement',
        labelStyle: { fill: '#9ca3af', fontWeight: 600 },
    },
    {
        id: 'e2-4',
        source: 'block-builder',
        target: 'bridge-relayer',
        animated: true,
        style: { stroke: '#f97316', strokeWidth: 2 },
    },
    {
        id: 'e4-5',
        source: 'bridge-relayer',
        target: 'l1-network',
        animated: true,
        style: { stroke: '#f97316', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#f97316' },
    },
    {
        id: 'e3-blob',
        source: 'execution',
        target: 'blob-da',
        animated: true,
        style: { stroke: '#ef4444', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' },
    },
    {
        id: 'eblob-l1',
        source: 'blob-da',
        target: 'l1-network',
        animated: true,
        style: { stroke: '#ef4444', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' },
    },
];

export const SystemDiagram = () => {
    const blobDAStatus = useChainStore((state) => state.blobDA);

    const liveNodes = useMemo(() => {
        return initialNodes.map((node) => {
            if (node.id === 'blob-da') {
                return {
                    ...node,
                    data: {
                        status: blobDAStatus.isOnline ? 'Online' : 'Offline',
                        metric: blobDAStatus.isOnline
                            ? `Batch #${blobDAStatus.latestBatch}`
                            : undefined,
                    },
                };
            }
            return node;
        });
    }, [blobDAStatus]);

    const [nodes, setNodes, onNodesChange] = useNodesState(liveNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    useEffect(() => {
        setNodes(liveNodes);
    }, [liveNodes, setNodes]);

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge(params, eds)),
        [setEdges]
    );

    return (
        <div className="w-full h-[600px] bg-gray-950 rounded-2xl overflow-hidden border border-white/5 relative">
            {/* Background Grid Pattern */}
            <div className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                    backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                }}
            />

            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                proOptions={{ hideAttribution: true }}
            >
                <Background gap={20} size={1} color="#334155" variant={BackgroundVariant.Dots} className="opacity-0" /> {/* Using custom bg above */}
                <Controls className="!bg-gray-800 !border-white/10 !fill-white" />
            </ReactFlow>

            <div className="absolute top-4 right-4 bg-black/40 backdrop-blur text-xs text-gray-400 px-3 py-1.5 rounded-lg border border-white/10">
                Live System Status
            </div>
        </div>
    );
};
