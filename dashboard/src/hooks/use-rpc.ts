"use client";

import { useState, useEffect, useCallback } from "react";
import { l1, l2, builder } from "@/lib/rpc-client";
import { TEST_ACCOUNT } from "@/types/chain";
import { useChainStore } from "@/stores/chain-store";

export function useChainData() {
  const [isLoading, setIsLoading] = useState(true);
  const { setL1Status, setL2Status, setBuilderStatus, setAccountBalances, addLog } = useChainStore();

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
    await Promise.all([fetchL1Data(), fetchL2Data(), fetchBuilderStatus(), fetchBalances()]);
    setIsLoading(false);
  }, [fetchL1Data, fetchL2Data, fetchBuilderStatus, fetchBalances]);

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
    fetchBalances,
  };
}
