"use client";

import { cn } from "@/lib/utils";

interface BridgeSelectorProps {
    selected: string;
    onSelect: (id: string) => void;
}

const bridges = [
    { id: "hyperlane", name: "Hyperlane", icon: "🌌", description: "Permissionless Interoperability" },
    { id: "optimism", name: "Optimism Native", icon: "🔴", description: "Standard OP Stack Bridge", disabled: true },
    { id: "layerzero", name: "LayerZero", icon: "0️⃣", description: "Omnichain Interoperability", disabled: true },
];

export function BridgeSelector({ selected, onSelect }: BridgeSelectorProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {bridges.map((bridge) => (
                <button
                    key={bridge.id}
                    onClick={() => !bridge.disabled && onSelect(bridge.id)}
                    disabled={bridge.disabled}
                    className={cn(
                        "relative group flex flex-col items-start p-4 rounded-xl border transition-all duration-300",
                        "text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        selected === bridge.id
                            ? "bg-primary/10 border-primary shadow-[0_0_20px_rgba(59,130,246,0.15)] scale-[1.02]"
                            : "bg-card/50 border-white/5 hover:border-white/10 hover:bg-card/80 hover:scale-[1.01]",
                        bridge.disabled && "opacity-50 cursor-not-allowed grayscale"
                    )}
                >
                    {selected === bridge.id && (
                        <div
                            className="absolute inset-0 rounded-xl bg-primary/5 -z-10 transition-all duration-500 ease-out"
                        />
                    )}

                    <div className="flex items-center gap-3 mb-2 w-full">
                        <span className="text-2xl p-2 rounded-lg bg-background/50 border border-white/5 group-hover:scale-110 transition-transform">
                            {bridge.icon}
                        </span>
                        <div className="flex-1">
                            <div className="font-semibold text-foreground tracking-tight">
                                {bridge.name}
                            </div>
                            {bridge.disabled && (
                                <div className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider">
                                    Coming Soon
                                </div>
                            )}
                        </div>
                        {selected === bridge.id && (
                            <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_currentColor] animate-pulse" />
                        )}
                    </div>

                    <div className="text-xs text-muted-foreground/80 font-medium pl-1">
                        {bridge.description}
                    </div>
                </button>
            ))}
        </div>
    );
}
