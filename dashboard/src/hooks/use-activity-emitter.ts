"use client";

import { useEffect, useRef } from "react";
import { useChainStore } from "@/stores/chain-store";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import { useBuilderMetricsStore } from "@/stores/builder-metrics-store";
import { useActivityFeedStore } from "@/stores/activity-feed-store";

/**
 * Bridges existing Zustand stores into the activity feed by subscribing
 * to state transitions and emitting events. Call once at the page root.
 */
export function useActivityEmitter() {
  const addEvent = useActivityFeedStore((s) => s.addEvent);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const unsubs: (() => void)[] = [];

    // --- Chain store: health transitions ---
    type HealthKey = { field: string; label: string; source: Parameters<typeof addEvent>[0] };
    const healthKeys: HealthKey[] = [
      { field: "l1", label: "L1 (Anvil)", source: "l1" },
      { field: "l2", label: "L2 (op-reth)", source: "l2" },
      { field: "builder", label: "Block Builder", source: "builder" },
      { field: "explorer", label: "L2 Explorer", source: "explorer" },
      { field: "explorerL1", label: "L1 Explorer", source: "explorer-l1" },
      { field: "privacyProxy", label: "Privacy Proxy", source: "privacy" },
      { field: "blobDA", label: "Blob DA", source: "blobda" },
      { field: "loadgen", label: "Load Generator", source: "loadgen" },
    ];

    for (const key of healthKeys) {
      const getOnline = (state: ReturnType<typeof useChainStore.getState>): boolean => {
        const obj = state[key.field as keyof typeof state];
        if (obj && typeof obj === "object" && "isOnline" in obj) {
          return (obj as { isOnline: boolean }).isOnline;
        }
        return false;
      };

      let prev = getOnline(useChainStore.getState());

      unsubs.push(
        useChainStore.subscribe((state) => {
          const cur = getOnline(state);
          if (cur !== prev) {
            prev = cur;
            addEvent(
              key.source,
              "health",
              cur ? "success" : "warning",
              `${key.label} ${cur ? "came online" : "went offline"}`,
            );
          }
        }),
      );
    }

    // Bridge has a different shape — track relayer and UI separately
    let prevBridgeRelayerOnline = useChainStore.getState().bridge.relayerOnline;
    unsubs.push(
      useChainStore.subscribe((state) => {
        const cur = state.bridge.relayerOnline;
        if (cur !== prevBridgeRelayerOnline) {
          prevBridgeRelayerOnline = cur;
          addEvent(
            "bridge",
            "health",
            cur ? "success" : "warning",
            `Bridge Relayer ${cur ? "came online" : "went offline"}`,
          );
        }
      }),
    );

    let prevBridgeUiOnline = useChainStore.getState().bridge.uiOnline;
    unsubs.push(
      useChainStore.subscribe((state) => {
        const cur = state.bridge.uiOnline;
        if (cur !== prevBridgeUiOnline) {
          prevBridgeUiOnline = cur;
          addEvent(
            "bridge",
            "health",
            cur ? "success" : "warning",
            `Bridge UI ${cur ? "came online" : "went offline"}`,
          );
        }
      }),
    );

    // --- Load test store: lifecycle events ---
    let prevStatus = useGoLoadTestStore.getState().status;
    unsubs.push(
      useGoLoadTestStore.subscribe((state) => {
        if (state.status !== prevStatus) {
          const prev = prevStatus;
          prevStatus = state.status;

          switch (state.status) {
            case "initializing":
              addEvent("loadgen", "loadtest", "info", "Load test initializing...");
              break;
            case "running":
              if (prev === "initializing") {
                addEvent("loadgen", "loadtest", "success", `Load test started (${state.config.pattern} pattern)`);
              }
              break;
            case "verifying":
              addEvent("loadgen", "loadtest", "info", "Load test verifying transactions...");
              break;
            case "completed":
              addEvent("loadgen", "loadtest", "success", `Load test completed: ${state.txConfirmedCount.toLocaleString()} confirmed`, {
                txSent: state.txSentCount,
                txConfirmed: state.txConfirmedCount,
                txFailed: state.txFailedCount,
              });
              break;
            case "error":
              addEvent("loadgen", "loadtest", "error", `Load test error: ${state.error ?? "unknown"}`);
              break;
          }
        }
      }),
    );

    // --- Builder metrics store: WS connection ---
    let prevBuilderConnected = useBuilderMetricsStore.getState().connected;
    unsubs.push(
      useBuilderMetricsStore.subscribe((state) => {
        if (state.connected !== prevBuilderConnected) {
          prevBuilderConnected = state.connected;
          addEvent(
            "builder",
            "system",
            state.connected ? "info" : "warning",
            `Builder metrics WS ${state.connected ? "connected" : "disconnected"}`,
          );
        }
      }),
    );

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [addEvent]);
}
