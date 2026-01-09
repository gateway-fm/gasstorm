import { create } from "zustand";
import type { LoadTestConfig, LoadTestState, TransactionRecord, CorrectnessResult, VerificationStatus, DeployedContracts } from "@/types/load-test";
import type { LoadTestReport } from "@/types/report";
import { DEFAULT_LOAD_TEST_CONFIG } from "@/types/load-test";
import { generateTestId } from "@/types/report";
import { generateLoadSchedule, getRateAtTime, type LoadScheduleEntry } from "@/lib/load-patterns";
import { sendTypedL2Transaction } from "@/lib/transaction-builder";
import { l2, getBuilderStatus } from "@/lib/rpc-client";
import { useMetricsStore } from "./metrics-store";
import { calculateStatistics } from "@/lib/statistics";
import { deployContracts, loadDeployedContracts, needsDeployment } from "@/lib/contract-deployer";

interface LoadTestActions {
  setConfig: (config: Partial<LoadTestConfig>) => void;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
  addTransaction: (tx: TransactionRecord) => void;
  updateTransaction: (txHash: string, update: Partial<TransactionRecord>) => void;
  generateReport: () => LoadTestReport | null;
  verifyCorrectness: () => Promise<CorrectnessResult | null>;
}

interface VerificationState {
  verificationStatus: VerificationStatus;
  correctnessResult: CorrectnessResult | null;
  peakAdaptiveRate: number; // Track peak rate achieved in adaptive mode
}

interface ContractState {
  deployedContracts: DeployedContracts | null;
  deploymentStatus: "idle" | "deploying" | "deployed" | "error";
  deploymentMessage: string | null;
}

interface LoadTestInternals {
  testId: string | null;
  schedule: LoadScheduleEntry[];
  intervalId: NodeJS.Timeout | null;
  tickIntervalId: NodeJS.Timeout | null;
}

type LoadTestStore = LoadTestState & LoadTestActions & VerificationState & ContractState & { _internals: LoadTestInternals };

export const useLoadTestStore = create<LoadTestStore>((set, get) => ({
  // State
  status: "idle",
  config: { ...DEFAULT_LOAD_TEST_CONFIG },
  startTime: null,
  elapsedTime: 0,
  transactions: [],
  currentRate: 0,
  txSentCount: 0,
  txConfirmedCount: 0,
  txFailedCount: 0,
  error: null,

  // Verification state
  verificationStatus: "idle",
  correctnessResult: null,
  peakAdaptiveRate: 0,

  // Contract state
  deployedContracts: null,
  deploymentStatus: "idle",
  deploymentMessage: null,

  // Internal state (not for UI)
  _internals: {
    testId: null,
    schedule: [],
    intervalId: null,
    tickIntervalId: null,
  },

  // Actions
  setConfig: (config) =>
    set((state) => ({
      config: state.config ? { ...state.config, ...config } : { ...DEFAULT_LOAD_TEST_CONFIG, ...config },
    })),

  start: async () => {
    const state = get();
    if (state.status === "running") return;

    const config = state.config;
    if (!config) {
      set({ error: "No configuration provided", status: "error" });
      return;
    }

    // Load or deploy contracts if needed
    let contracts = loadDeployedContracts();
    const txType = config.transactionType ?? "eth-transfer";

    if (needsDeployment(txType, contracts)) {
      set({ deploymentStatus: "deploying", deploymentMessage: "Checking contracts..." });
      try {
        contracts = await deployContracts((msg) => {
          set({ deploymentMessage: msg });
        });
        set({ deployedContracts: contracts, deploymentStatus: "deployed" });
      } catch (error) {
        set({
          error: `Contract deployment failed: ${error}`,
          status: "error",
          deploymentStatus: "error",
        });
        return;
      }
    } else {
      set({ deployedContracts: contracts, deploymentStatus: "deployed" });
    }

    // Fetch builder configuration
    try {
      const builderStatus = await getBuilderStatus();
      set((state) => ({
        config: { ...state.config!, blockTimeMs: builderStatus.blockTimeMs },
      }));
    } catch (error) {
      console.warn("Failed to fetch builder status:", error);
    }

    // Reset metrics store
    useMetricsStore.getState().reset();

    // Generate schedule (re-get config as it may have been updated)
    const updatedConfig = get().config!;
    const schedule = generateLoadSchedule(updatedConfig);
    const testId = generateTestId();
    const startTime = Date.now();

    set({
      status: "running",
      startTime,
      elapsedTime: 0,
      transactions: [],
      currentRate: schedule[0]?.rate ?? 0,
      txSentCount: 0,
      txConfirmedCount: 0,
      txFailedCount: 0,
      error: null,
      verificationStatus: "idle",
      correctnessResult: null,
      peakAdaptiveRate: 0,
      _internals: {
        ...state._internals,
        testId,
        schedule,
      },
    });

    // Start the transaction sender
    const sendInterval = 100; // Check every 100ms
    let lastSendTime = 0;
    let txToSendThisSec = 0;
    let txSentThisSec = 0;

    // Track nonce locally to avoid race conditions when sending multiple txs
    // before they're mined into a block
    let pendingNonce: number | null = null;

    // Lock to prevent concurrent sends which can cause nonce gaps
    let isSending = false;

    // Adaptive rate for adaptive mode
    let adaptiveRate = config.adaptiveInitialRate ?? 10;
    let lastAdaptiveAdjust = 0;
    const adaptiveAdjustInterval = 500; // Adjust every 500ms

    const intervalId = setInterval(async () => {
      const currentState = get();
      if (currentState.status !== "running") return;

      const now = Date.now();
      const elapsed = now - (currentState.startTime ?? now);

      // Check if test is complete
      if (elapsed >= (config.duration ?? 60) * 1000) {
        get().stop();
        return;
      }

      // Get current rate - use adaptive logic for adaptive mode
      let rate: number;
      if (config.pattern === "adaptive") {
        // Adaptive rate adjustment
        if (now - lastAdaptiveAdjust >= adaptiveAdjustInterval) {
          const pendingCount = currentState.transactions.filter(t => t.status === "pending").length;
          const targetPending = config.adaptiveTargetPending ?? 50;
          const rateStep = config.adaptiveRateStep ?? 5;

          if (pendingCount > targetPending * 1.5) {
            // Way too many pending - back off aggressively
            adaptiveRate = Math.max(1, adaptiveRate * 0.5);
          } else if (pendingCount > targetPending * 1.2) {
            // Too many pending - back off
            adaptiveRate = Math.max(1, adaptiveRate * 0.8);
          } else if (pendingCount < targetPending * 0.3) {
            // Room to grow significantly - increase faster
            adaptiveRate = adaptiveRate + rateStep * 2;
          } else if (pendingCount < targetPending * 0.7) {
            // Room to grow - increase rate
            adaptiveRate = adaptiveRate + rateStep;
          }
          // Between 0.7 and 1.2 of target - rate is good, maintain

          lastAdaptiveAdjust = now;

          // Track peak rate
          if (adaptiveRate > currentState.peakAdaptiveRate) {
            set({ peakAdaptiveRate: adaptiveRate });
          }
        }
        rate = adaptiveRate;
      } else {
        rate = getRateAtTime(currentState._internals.schedule, elapsed);
      }
      set({ currentRate: rate });

      // Calculate how many TX to send this interval
      const secondElapsed = Math.floor(elapsed / 1000);
      const prevSecond = Math.floor((elapsed - sendInterval) / 1000);

      if (secondElapsed > prevSecond) {
        // New second, reset counters
        txToSendThisSec = Math.round(rate);
        txSentThisSec = 0;
      }

      // Send transactions if we haven't sent enough this second
      // Use lock to prevent concurrent sends which cause nonce gaps
      if (txSentThisSec < txToSendThisSec && now - lastSendTime >= 1000 / Math.max(rate, 1) && !isSending) {
        isSending = true;
        try {
          const currentBlock = await l2.getBlockNumber();

          // Initialize nonce from chain on first tx, then track locally
          if (pendingNonce === null) {
            const { TEST_ACCOUNT } = await import("@/types/chain");
            pendingNonce = await l2.getTransactionCount(TEST_ACCOUNT.address);
          }

          // Get current deployed contracts
          const currentContracts = get().deployedContracts ?? {};

          // Capture nonce for this tx before any async operations
          const txNonce = pendingNonce;
          pendingNonce++; // Increment immediately to reserve this nonce

          // Use local nonce and increment for next tx
          const { txHash, nonce, submittedAt } = await sendTypedL2Transaction({
            transactionType: txType,
            contracts: currentContracts,
            nonce: txNonce,
          });

          const txRecord: TransactionRecord = {
            txHash,
            nonce,
            submittedAt,
            submittedAtBlock: currentBlock,
            status: "pending",
          };

          get().addTransaction(txRecord);
          useMetricsStore.getState().addTransaction(txRecord);

          set((s) => ({ txSentCount: s.txSentCount + 1 }));
          txSentThisSec++;
          lastSendTime = now;
        } catch (error) {
          console.error("Failed to send transaction:", error);
          set((s) => ({ txFailedCount: s.txFailedCount + 1 }));
          // Note: nonce was already incremented, but that's safer than
          // trying to reuse it and potentially sending duplicate transactions
        } finally {
          isSending = false;
        }
      }
    }, sendInterval);

    // Start elapsed time ticker
    const tickIntervalId = setInterval(() => {
      const currentState = get();
      if (currentState.status === "running" && currentState.startTime) {
        set({ elapsedTime: Math.floor((Date.now() - currentState.startTime) / 1000) });
      }
    }, 1000);

    set({
      _internals: {
        ...get()._internals,
        intervalId,
        tickIntervalId,
      },
    });
  },

  pause: () => {
    const state = get();
    if (state._internals.intervalId) {
      clearInterval(state._internals.intervalId);
    }
    set({ status: "paused" });
  },

  resume: () => {
    const state = get();
    if (state.status !== "paused") return;
    // Restart with same config
    get().start();
  },

  stop: async () => {
    const state = get();
    if (state._internals.intervalId) {
      clearInterval(state._internals.intervalId);
    }
    if (state._internals.tickIntervalId) {
      clearInterval(state._internals.tickIntervalId);
    }
    // Calculate final elapsed time to avoid off-by-one from ticker interval
    const finalElapsedTime = state.startTime
      ? Math.round((Date.now() - state.startTime) / 1000)
      : state.elapsedTime;
    set({
      status: "completed",
      elapsedTime: finalElapsedTime,
      _internals: {
        ...state._internals,
        intervalId: null,
        tickIntervalId: null,
      },
    });

    // Send flush transactions to trigger block production for any pending TXs
    // This is needed when skip_empty_blocks is enabled
    try {
      const { sendL2Transaction } = await import("@/lib/transaction-builder");
      // Send 3 small transactions to ensure blocks are produced
      for (let i = 0; i < 3; i++) {
        await sendL2Transaction({ value: 1n }); // 1 wei
        await new Promise(resolve => setTimeout(resolve, 300)); // Wait between sends
      }
    } catch (error) {
      console.warn("Failed to send flush transactions:", error);
    }
  },

  reset: () => {
    const state = get();
    if (state._internals.intervalId) {
      clearInterval(state._internals.intervalId);
    }
    if (state._internals.tickIntervalId) {
      clearInterval(state._internals.tickIntervalId);
    }
    useMetricsStore.getState().reset();
    set({
      status: "idle",
      config: { ...DEFAULT_LOAD_TEST_CONFIG },
      startTime: null,
      elapsedTime: 0,
      transactions: [],
      currentRate: 0,
      txSentCount: 0,
      txConfirmedCount: 0,
      txFailedCount: 0,
      error: null,
      verificationStatus: "idle",
      correctnessResult: null,
      peakAdaptiveRate: 0,
      deploymentStatus: "idle",
      deploymentMessage: null,
      _internals: {
        testId: null,
        schedule: [],
        intervalId: null,
        tickIntervalId: null,
      },
    });
  },

  addTransaction: (tx) =>
    set((state) => ({
      transactions: [...state.transactions, tx],
    })),

  updateTransaction: (txHash, update) =>
    set((state) => {
      const transactions = state.transactions.map((tx) =>
        tx.txHash === txHash ? { ...tx, ...update } : tx
      );

      let txConfirmedCount = state.txConfirmedCount;
      let txFailedCount = state.txFailedCount;

      if (update.status === "confirmed") {
        txConfirmedCount++;
        // Update metrics store to track confirmed load test transactions
        useMetricsStore.getState().updateTransaction(txHash, update);
        if (update.confirmedAt) {
          const tx = state.transactions.find((t) => t.txHash === txHash);
          if (tx) {
            const latency = update.confirmedAt - tx.submittedAt;
            useMetricsStore.getState().recordLatency(latency);
          }
        }
      } else if (update.status === "failed") {
        txFailedCount++;
      }

      return { transactions, txConfirmedCount, txFailedCount };
    }),

  generateReport: () => {
    const state = get();
    const metricsState = useMetricsStore.getState();

    if (!state.config || !state.startTime) return null;

    const endTime = state.startTime + state.elapsedTime * 1000;

    // Calculate latency statistics from confirmed transactions
    const latencies = state.transactions
      .filter((tx) => tx.status === "confirmed" && tx.confirmedAt)
      .map((tx) => tx.confirmedAt! - tx.submittedAt);

    const mgasValues = metricsState.blockMetrics.map((m) => m.mgasPerSec);
    const txsValues = metricsState.blockMetrics.map((m) => m.txPerSec);
    const fillValues = metricsState.blockMetrics.map((m) => m.fillRate);

    const report: LoadTestReport = {
      meta: {
        testId: state._internals.testId ?? generateTestId(),
        startTime: new Date(state.startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        duration: state.elapsedTime,
        config: state.config,
      },
      summary: {
        totalTxSent: state.txSentCount,
        totalTxConfirmed: state.txConfirmedCount,
        totalTxFailed: state.txFailedCount,
        peakMgasPerSec: metricsState.snapshot.peakMgasPerSec,
        peakTxPerSec: metricsState.snapshot.peakTxPerSec,
        averageBlockFillRate: metricsState.snapshot.averageFillRate,
        blocksProduced: metricsState.snapshot.blocksProduced,
        totalGasUsed: metricsState.snapshot.totalGasUsed.toString(),
      },
      latency: calculateStatistics(latencies),
      throughput: {
        mgas: calculateStatistics(mgasValues),
        txs: calculateStatistics(txsValues),
      },
      blockFill: calculateStatistics(fillValues),
      timeSeries: metricsState.timeSeries,
      rawData: {
        transactions: state.transactions,
        blocks: metricsState.blockMetrics,
      },
    };

    return report;
  },

  verifyCorrectness: async () => {
    const state = get();
    if (state.transactions.length === 0) return null;

    set({ verificationStatus: "verifying" });

    try {
      // Query receipt or transaction inclusion for each transaction
      const verificationPromises = state.transactions.map(async (tx) => {
        // First try receipt - but catch errors as op-reth may fail with "failed to calculate l1 gas fee"
        try {
          const receipt = await l2.getTransactionReceipt(tx.txHash);
          if (receipt && receipt.blockNumber) {
            return {
              txHash: tx.txHash,
              nonce: tx.nonce,
              included: true,
              failed: receipt.status === "0x0"
            };
          }
        } catch {
          // Receipt failed (common with op-reth L1 fee issues), try getTransactionByHash
        }

        // Fallback: check if tx is in a block via getTransactionByHash
        try {
          const txInfo = await l2.getTransactionByHash(tx.txHash);
          if (txInfo && txInfo.blockNumber) {
            // Transaction is in a block, consider it confirmed
            return { txHash: tx.txHash, nonce: tx.nonce, included: true, failed: false };
          }
        } catch {
          // Both methods failed
        }

        return { txHash: tx.txHash, nonce: tx.nonce, included: false, failed: false };
      });

      const results = await Promise.all(verificationPromises);

      // Categorize results
      const missing: string[] = [];
      const failed: string[] = [];
      let onChainConfirmed = 0;
      let onChainFailed = 0;

      for (const result of results) {
        if (!result.included) {
          missing.push(result.txHash);
        } else if (result.failed) {
          failed.push(result.txHash);
          onChainFailed++;
        } else {
          onChainConfirmed++;
        }
      }

      // Check for nonce gaps
      const nonces = state.transactions
        .map((tx) => tx.nonce)
        .sort((a, b) => a - b);
      const nonceGaps: number[] = [];
      for (let i = 1; i < nonces.length; i++) {
        if (nonces[i] !== nonces[i - 1] + 1) {
          // Found a gap - record missing nonces
          for (let n = nonces[i - 1] + 1; n < nonces[i]; n++) {
            nonceGaps.push(n);
          }
        }
      }

      const correctnessResult: CorrectnessResult = {
        totalSent: state.transactions.length,
        onChainConfirmed,
        onChainFailed,
        missing: missing.length,
        nonceGaps,
        missingTxHashes: missing,
        verified: missing.length === 0 && onChainFailed === 0,
        verifiedAt: Date.now(),
      };

      set({
        verificationStatus: "completed",
        correctnessResult,
      });

      return correctnessResult;
    } catch (error) {
      console.error("Verification failed:", error);
      set({ verificationStatus: "error" });
      return null;
    }
  },
}));
