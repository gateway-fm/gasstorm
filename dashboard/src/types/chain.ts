export interface ChainStatus {
  isOnline: boolean;
  blockNumber: number;
  chainId: number;
  clientName?: string;
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
  BLOB_DA_RPC: "/rpc/blobda",
  L1_WS: "/ws/l1",
  L2_WS: "/ws/l2",
} as const;

// Anvil account #0 - used by load generator (DO NOT use for bridging to avoid nonce conflicts)
export const TEST_ACCOUNT = {
  address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
} as const;

// Anvil account #1 - used by Hyperlane deployer
export const DEPLOYER_ACCOUNT = {
  address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
} as const;

// Anvil account #2 - dedicated for bridge operations (separate from load generator and deployer)
export const BRIDGE_ACCOUNT = {
  address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
} as const;

export const RECIPIENT_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

export const CHAIN_IDS = {
  L1: 1n,
  L2: 42069n,
} as const;

// Hyperlane contract addresses
// Note: These addresses are from the Foundry deployment - update after chain reset
// Deployed via DeployBridge.s.sol - same addresses on both chains (deterministic)
export const HYPERLANE_CONTRACTS = {
  // Warp routes (HypNativeSimple) for ETH bridging
  L1_WARP_ROUTE: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  L2_WARP_ROUTE: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  // TestMailbox (simplified for POC)
  L1_MAILBOX: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  L2_MAILBOX: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  L1_DOMAIN_ID: 31337,
  L2_DOMAIN_ID: 42069,
} as const;

export const WARP_ROUTE_ABI = [
  "function transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount) payable returns (bytes32)",
  "function quoteGasPayment(uint32 _destination) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "event SentTransferRemote(uint32 indexed destination, bytes32 indexed recipient, uint256 amount)",
  "event ReceivedTransferRemote(uint32 indexed origin, bytes32 indexed recipient, uint256 amount)",
] as const;

export const MAILBOX_ABI = [
  "function nonce() view returns (uint32)",
  "event Dispatch(address indexed sender, uint32 indexed destination, bytes32 indexed recipient, bytes message)",
  "event Process(uint32 indexed origin, bytes32 indexed sender, address indexed recipient)",
] as const;
