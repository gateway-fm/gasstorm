"use client";

import { memo } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { ArchitectureEdge } from "../types";
import { ANIMATION, COLORS } from "../constants";

/**
 * Calculate animation duration based on TPS
 * Higher TPS = faster animation (shorter duration)
 */
function getAnimationDuration(tps: number): number {
  if (tps <= 0) return ANIMATION.baseDuration;

  const ratio = Math.min(tps / ANIMATION.maxTpsThreshold, 1);
  const duration =
    ANIMATION.baseDuration - ratio * (ANIMATION.baseDuration - ANIMATION.minDuration);

  return Math.max(duration, ANIMATION.minDuration);
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
  const { animated = false, tps = 0 } = data || {};

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const duration = getAnimationDuration(tps);
  const strokeColor = animated ? COLORS.edge.active : COLORS.edge.inactive;

  return (
    <>
      {/* Base edge line */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth: 2,
          opacity: animated ? 1 : 0.5,
        }}
      />

      {/* Animated particle when active */}
      {animated && (
        <circle r="4" fill={COLORS.edge.active}>
          <animateMotion
            dur={`${duration}s`}
            repeatCount="indefinite"
            path={edgePath}
          />
        </circle>
      )}

      {/* Label if provided */}
      {data?.label && (
        <text>
          <textPath
            href={`#${id}`}
            startOffset="50%"
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {data.label}
          </textPath>
        </text>
      )}
    </>
  );
});
