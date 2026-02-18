"use client";

import { useState, useEffect, useCallback } from "react";
import { l1, l2, builder, blobDA } from "@/lib/rpc-client";
import { TEST_ACCOUNT } from "@/types/chain";
import { useChainStore } from "@/stores/chain-store";

const COMPRESSION_NAMES: Record<number, string> = {
  0: "none",
  1: "brotli",
  2: "zstd",
};

export function useChainData() {
  const [isLoading, setIsLoading] = useState(true);
  const { setL1Status, setL2Status, setBuilderStatus, setBlobDAStatus, setExplorerStatus, setPrivacyProxyStatus, setAccountBalances, addLog } = useChainStore();

  const fetchL1Data = useCallback(async () => {
    try {
      const [blockNumber, chainId, gasPrice] = await Promise.all([
        l1.getBlockNumber(),
        l1.getChainId(),
        l1.getGasPrice(),
      ]);

      setL1Status({
        isOnline: true,
        blockNumber,
        chainId,
        gasPrice,
      });
      return true;
    } catch {
      setL1Status({ isOnline: false });
      return false;
    }
  }, [setL1Status]);

  const fetchL2Data = useCallback(async () => {
    try {
      const [blockNumber, chainId] = await Promise.all([
        l2.getBlockNumber(),
        l2.getChainId(),
      ]);

      setL2Status({
        isOnline: true,
        blockNumber,
        chainId,
      });
      return true;
    } catch {
      setL2Status({ isOnline: false });
      return false;
    }
  }, [setL2Status]);

  const fetchBuilderStatus = useCallback(async () => {
    try {
      const status = await builder.getStatus();
      setBuilderStatus({
        isOnline: true,
        blockTimeMs: status.blockTimeMs,
        skipEmptyBlocks: status.skipEmptyBlocks,
        pendingTxCount: status.pendingTxCount,
      });
      return true;
    } catch {
      setBuilderStatus({ isOnline: false });
      return false;
    }
  }, [setBuilderStatus]);

  const fetchBlobDAData = useCallback(async () => {
    try {
      const blobs = await blobDA.getBlobs(1, 0);
      const latest = blobs?.[0];
      setBlobDAStatus({
        isOnline: true,
        latestBatch: latest ? latest.endBatch : 0,
        compression: latest ? (COMPRESSION_NAMES[latest.compression] ?? "unknown") : "unknown",
      });
      return true;
    } catch {
      setBlobDAStatus({ isOnline: false });
      return false;
    }
  }, [setBlobDAStatus]);

  const fetchExplorerHealth = useCallback(async () => {
    try {
      const resp = await fetch("/api/explorer/health", { signal: AbortSignal.timeout(5000) });
      setExplorerStatus({ isOnline: resp.ok });
    } catch {
      setExplorerStatus({ isOnline: false });
    }
  }, [setExplorerStatus]);

  const fetchPrivacyHealth = useCallback(async () => {
    try {
      const resp = await fetch("/api/privacy/health", { signal: AbortSignal.timeout(5000) });
      setPrivacyProxyStatus({ isOnline: resp.ok });
    } catch {
      setPrivacyProxyStatus({ isOnline: false });
    }
  }, [setPrivacyProxyStatus]);

  const fetchBalances = useCallback(async () => {
    try {
      const [l1Balance, l2Balance] = await Promise.all([
        l1.getBalance(TEST_ACCOUNT.address),
        l2.getBalance(TEST_ACCOUNT.address),
      ]);
      setAccountBalances(l1Balance, l2Balance);
    } catch {
      // Silently fail for balances
    }
  }, [setAccountBalances]);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchL1Data(), fetchL2Data(), fetchBuilderStatus(), fetchBlobDAData(), fetchExplorerHealth(), fetchPrivacyHealth(), fetchBalances()]);
    setIsLoading(false);
  }, [fetchL1Data, fetchL2Data, fetchBuilderStatus, fetchBlobDAData, fetchExplorerHealth, fetchPrivacyHealth, fetchBalances]);

  useEffect(() => {
    // Use microtask to avoid synchronous setState in effect body
    queueMicrotask(() => {
      refreshAll();
      addLog("Connected to RPC endpoints", "info");
    });

    // Set up polling interval (30s fallback)
    const interval = setInterval(refreshAll, 30000);
    return () => clearInterval(interval);
  }, [refreshAll, addLog]);

  return {
    isLoading,
    refreshAll,
    fetchL1Data,
    fetchL2Data,
    fetchBuilderStatus,
    fetchBlobDAData,
    fetchExplorerHealth,
    fetchPrivacyHealth,
    fetchBalances,
  };
}
