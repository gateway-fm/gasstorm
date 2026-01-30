"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";

type PortType = "input" | "output";
type PortColor = "violet" | "purple" | "blue" | "cyan" | "emerald" | "orange" | "pink";

const portColors: Record<PortColor, { dot: string; ring: string }> = {
  violet: { dot: "bg-violet-500", ring: "ring-violet-500/30" },
  purple: { dot: "bg-purple-500", ring: "ring-purple-500/30" },
  blue: { dot: "bg-blue-500", ring: "ring-blue-500/30" },
  cyan: { dot: "bg-cyan-500", ring: "ring-cyan-500/30" },
  emerald: { dot: "bg-emerald-500", ring: "ring-emerald-500/30" },
  orange: { dot: "bg-orange-500", ring: "ring-orange-500/30" },
  pink: { dot: "bg-pink-500", ring: "ring-pink-500/30" },
};

interface PortBadgeProps {
  id: string;
  label: string;
  type: PortType;
  color: PortColor;
  active?: boolean;
  position?: "top" | "middle" | "bottom";
}

export const PortBadge = memo(function PortBadge({
  id,
  label,
  type,
  color,
  active = true,
  position = "middle",
}: PortBadgeProps) {
  const colors = portColors[color];
  const isInput = type === "input";

  // Calculate vertical position offset
  const positionOffset = position === "top" ? "20%" : position === "bottom" ? "80%" : "50%";

  return (
    <div
      className={cn(
        "absolute flex items-center gap-1.5",
        isInput ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1"
      )}
      style={{ top: positionOffset, transform: `translateY(-50%) ${isInput ? 'translateX(-100%)' : 'translateX(100%)'}` }}
    >
      {/* Label */}
      <span
        className={cn(
          "text-[8px] uppercase tracking-wider font-medium whitespace-nowrap",
          active ? "text-muted-foreground" : "text-muted-foreground/50",
          isInput ? "order-1" : "order-0"
        )}
      >
        {label}
      </span>

      {/* Handle/Port */}
      <Handle
        id={id}
        type={isInput ? "target" : "source"}
        position={isInput ? Position.Left : Position.Right}
        className={cn(
          "!relative !transform-none !inset-auto",
          "!h-2.5 !w-2.5 !rounded-full !border-0",
          "!ring-2",
          colors.dot,
          colors.ring,
          !active && "!opacity-40"
        )}
      />
    </div>
  );
});

interface PortListProps {
  ports: Array<{
    id: string;
    label: string;
    color: PortColor;
    active?: boolean;
  }>;
  type: PortType;
  className?: string;
}

export const PortList = memo(function PortList({
  ports,
  type,
  className,
}: PortListProps) {
  const isInput = type === "input";

  return (
    <div
      className={cn(
        "absolute top-1/2 -translate-y-1/2 flex flex-col gap-3",
        isInput ? "-left-2" : "-right-2",
        className
      )}
    >
      {ports.map((port) => (
        <div key={port.id} className={cn("flex items-center gap-1.5", isInput ? "flex-row-reverse" : "flex-row")}>
          <span
            className={cn(
              "text-[8px] uppercase tracking-wider font-medium whitespace-nowrap",
              port.active !== false ? "text-muted-foreground" : "text-muted-foreground/50"
            )}
          >
            {port.label}
          </span>
          <Handle
            id={port.id}
            type={isInput ? "target" : "source"}
            position={isInput ? Position.Left : Position.Right}
            className={cn(
              "!relative !transform-none !inset-auto",
              "!h-2 !w-2 !rounded-full !border-0",
              "!ring-2",
              portColors[port.color].dot,
              portColors[port.color].ring,
              port.active === false && "!opacity-40"
            )}
          />
        </div>
      ))}
    </div>
  );
});
