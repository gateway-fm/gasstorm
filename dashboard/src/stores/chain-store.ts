import { create } from "zustand";
import type { ChainStatus, LogEntry, LogEntryType } from "@/types/chain";

interface BuilderStatus {
  isOnline: boolean;
  blockTimeMs: number;
  skipEmptyBlocks: boolean;
  pendingTxCount: number;
}

interface ChainState {
  l1: ChainStatus;
  l2: ChainStatus;
  builder: BuilderStatus;
  accountL1Balance: bigint;
  accountL2Balance: bigint;
  logs: LogEntry[];
  lastL1Block: number;
  lastL2Block: number;
}

interface ChainActions {
  setL1Status: (status: Partial<ChainStatus>) => void;
  setL2Status: (status: Partial<ChainStatus>) => void;
  setBuilderStatus: (status: Partial<BuilderStatus>) => void;
  setAccountBalances: (l1?: bigint, l2?: bigint) => void;
  setLastL1Block: (block: number) => void;
  setLastL2Block: (block: number) => void;
  addLog: (message: string, type?: LogEntryType) => void;
  clearLogs: () => void;
}

type ChainStore = ChainState & ChainActions;

const initialChainStatus: ChainStatus = {
  isOnline: false,
  blockNumber: 0,
  chainId: 0,
};

const initialBuilderStatus: BuilderStatus = {
  isOnline: false,
  blockTimeMs: 2000,
  skipEmptyBlocks: false,
  pendingTxCount: 0,
};

export const useChainStore = create<ChainStore>((set) => ({
  // State
  l1: { ...initialChainStatus },
  l2: { ...initialChainStatus },
  builder: { ...initialBuilderStatus },
  accountL1Balance: 0n,
  accountL2Balance: 0n,
  logs: [
    {
      id: "init",
      timestamp: new Date(),
      message: "[Dashboard] R&D Test Rig initialized",
      type: "info",
    },
  ],
  lastL1Block: 0,
  lastL2Block: 0,

  // Actions
  setL1Status: (status) =>
    set((state) => ({
      l1: { ...state.l1, ...status },
    })),

  setL2Status: (status) =>
    set((state) => ({
      l2: { ...state.l2, ...status },
    })),

  setBuilderStatus: (status) =>
    set((state) => ({
      builder: { ...state.builder, ...status },
    })),

  setAccountBalances: (l1, l2) =>
    set((state) => ({
      accountL1Balance: l1 ?? state.accountL1Balance,
      accountL2Balance: l2 ?? state.accountL2Balance,
    })),

  setLastL1Block: (block) => set(() => ({ lastL1Block: block })),
  setLastL2Block: (block) => set(() => ({ lastL2Block: block })),

  addLog: (message, type = "info") =>
    set((state) => {
      const newLog: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date(),
        message,
        type,
      };
      const logs = [newLog, ...state.logs].slice(0, 50); // Keep last 50
      return { logs };
    }),

  clearLogs: () =>
    set(() => ({
      logs: [],
    })),
}));
