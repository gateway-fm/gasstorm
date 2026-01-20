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

export const HYPERLANE_CONTRACTS = {
  L1_WARP_ROUTE: "0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1",
  L2_WARP_ROUTE: "0xacb32FA0Af94c47818FB01543ebA4C7BcaC1bF1D",
  L1_MAILBOX: "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
  L2_MAILBOX: "0xF817690b2d885D120e623e9Bc70806eBC29b47dc",
  L1_DOMAIN_ID: 31337,
  L2_DOMAIN_ID: 42069,
} as const;

export const WARP_ROUTE_ABI = [
  "function transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount) payable returns (bytes32)",
  "function quoteGasPayment(uint32 _destination) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
] as const;
