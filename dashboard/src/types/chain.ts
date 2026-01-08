export interface ChainStatus {
  isOnline: boolean;
  blockNumber: number;
  chainId: number;
  gasPrice?: bigint;
  latestBlockHash?: string;
}

export interface BlockInfo {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  gasUsed: bigint;
  gasLimit: bigint;
  transactionCount: number;
  baseFeePerGas?: bigint;
}

export interface AccountInfo {
  address: string;
  l1Balance: bigint;
  l2Balance: bigint;
}

export type LogEntryType = "info" | "success" | "error" | "block" | "warning";

export interface LogEntry {
  id: string;
  timestamp: Date;
  message: string;
  type: LogEntryType;
}

export const RPC_ENDPOINTS = {
  L1_RPC: "/rpc/l1",
  L2_RPC: "/rpc/l2",
  BUILDER_RPC: "/rpc/builder",
  L1_WS: "/ws/l1",
  L2_WS: "/ws/l2",
} as const;

export const TEST_ACCOUNT = {
  address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
} as const;

export const RECIPIENT_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

export const CHAIN_IDS = {
  L1: 1n,
  L2: 42069n,
} as const;
