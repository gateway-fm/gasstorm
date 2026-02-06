"use client";

import { memo, useMemo } from "react";
import { BaseEdge, getBezierPath, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import type { ArchitectureEdge } from "../types";
import { ANIMATION, COLORS } from "../constants";

function getAnimationDuration(tps: number): number {
  if (tps <= 0) return ANIMATION.baseDuration;
  const ratio = Math.min(tps / ANIMATION.maxTpsThreshold, 1);
  return Math.max(
    ANIMATION.baseDuration - ratio * (ANIMATION.baseDuration - ANIMATION.minDuration),
    ANIMATION.minDuration
  );
}

function getParticleCount(tps: number): number {
  if (tps <= 0) return 1;
  if (tps < 100) return 2;
  if (tps < 500) return 3;
  return 4;
}

export const AnimatedEdge = memo(function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
}: EdgeProps<ArchitectureEdge>) {
  const { animated = false, tps = 0, label } = data || {};

  // Use bezier for all edges - simpler and more reliable
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const duration = getAnimationDuration(tps);
  const particleCount = animated ? getParticleCount(tps) : 0;
  const strokeColor = animated ? COLORS.edge.active : COLORS.edge.inactive;

  const particles = useMemo(() => {
    return Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      delay: (duration / particleCount) * i,
    }));
  }, [particleCount, duration]);

  return (
    <>
      {/* Glow effect */}
      {animated && (
        <BaseEdge
          id={`${id}-glow`}
          path={edgePath}
          style={{
            stroke: strokeColor,
            strokeWidth: 6,
            opacity: 0.1,
            filter: "blur(3px)",
          }}
        />
      )}

      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth: animated ? 2 : 1.5,
          opacity: animated ? 0.7 : 0.4,
          strokeDasharray: !animated ? "6 4" : undefined,
        }}
      />

      {/* Particles */}
      {animated &&
        particles.map((particle) => (
          <circle key={particle.id} r="2.5" fill={strokeColor}>
            <animateMotion
              dur={`${duration}s`}
              repeatCount="indefinite"
              path={edgePath}
              begin={`${particle.delay}s`}
            />
          </circle>
        ))}

      {/* Label pill */}
      {label && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          <rect
            x={-28}
            y={-7}
            width={56}
            height={14}
            rx={7}
            fill="hsl(var(--card))"
            stroke={animated ? strokeColor : "hsl(var(--border))"}
            strokeWidth="0.5"
            opacity={0.9}
          />
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[8px] font-medium"
            fill={animated ? strokeColor : "hsl(var(--muted-foreground))"}
          >
            {label}
          </text>
        </g>
      )}
    </>
  );
});
