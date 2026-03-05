import { RPC_ENDPOINTS } from "@/types/chain";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params: unknown[];
  id: number;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

let requestId = 0;

export async function rpcCall<T = unknown>(
  url: string,
  method: string,
  params: unknown[] = []
): Promise<T> {
  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    method,
    params,
    id: ++requestId,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(10000),
  });

  const data: JsonRpcResponse<T> = await response.json();

  if (data.error) {
    throw new Error(`RPC error ${data.error.code}: Request failed`);
  }

  return data.result as T;
}

export async function getBlockNumber(rpc: string): Promise<number> {
  const result = await rpcCall<string>(rpc, "eth_blockNumber");
  return parseInt(result, 16);
}

export async function getChainId(rpc: string): Promise<number> {
  const result = await rpcCall<string>(rpc, "eth_chainId");
  return parseInt(result, 16);
}

export async function getGasPrice(rpc: string): Promise<bigint> {
  const result = await rpcCall<string>(rpc, "eth_gasPrice");
  return BigInt(result);
}

export async function getBalance(rpc: string, address: string): Promise<bigint> {
  const result = await rpcCall<string>(rpc, "eth_getBalance", [address, "latest"]);
  return BigInt(result);
}

export async function getTransactionCount(rpc: string, address: string, blockTag: "latest" | "pending" = "pending"): Promise<number> {
  const result = await rpcCall<string>(rpc, "eth_getTransactionCount", [address, blockTag]);
  return parseInt(result, 16);
}

export interface RpcBlock {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: string;
  gasUsed: string;
  gasLimit: string;
  transactions: (string | { hash: string })[];
  baseFeePerGas?: string;
}

// Helper to extract transaction hashes from block data
export function extractTxHashes(transactions: RpcBlock['transactions']): string[] {
  return transactions.map(tx =>
    typeof tx === 'string' ? tx : tx.hash
  );
}

export async function getBlockByNumber(
  rpc: string,
  blockNumber: number | "latest",
  fullTx = false
): Promise<RpcBlock | null> {
  const blockParam = blockNumber === "latest" ? "latest" : `0x${blockNumber.toString(16)}`;
  return rpcCall<RpcBlock | null>(rpc, "eth_getBlockByNumber", [blockParam, fullTx]);
}

export async function sendRawTransaction(rpc: string, signedTx: string): Promise<string> {
  return rpcCall<string>(rpc, "eth_sendRawTransaction", [signedTx]);
}

export async function getTransactionReceipt(
  rpc: string,
  txHash: string
): Promise<{ status: string; gasUsed: string; blockNumber: string; contractAddress?: string } | null> {
  return rpcCall(rpc, "eth_getTransactionReceipt", [txHash]);
}

export async function getCode(rpc: string, address: string): Promise<string> {
  return rpcCall<string>(rpc, "eth_getCode", [address, "latest"]);
}

export async function getTransactionByHash(
  rpc: string,
  txHash: string
): Promise<{ blockNumber: string | null; blockHash: string | null } | null> {
  return rpcCall(rpc, "eth_getTransactionByHash", [txHash]);
}

// Convenience functions for specific endpoints
export const l1 = {
  getBlockNumber: () => getBlockNumber(RPC_ENDPOINTS.L1_RPC),
  getChainId: () => getChainId(RPC_ENDPOINTS.L1_RPC),
  getGasPrice: () => getGasPrice(RPC_ENDPOINTS.L1_RPC),
  getBalance: (address: string) => getBalance(RPC_ENDPOINTS.L1_RPC, address),
  getTransactionCount: (address: string, blockTag?: "latest" | "pending") => getTransactionCount(RPC_ENDPOINTS.L1_RPC, address, blockTag),
  getBlockByNumber: (blockNumber: number | "latest") =>
    getBlockByNumber(RPC_ENDPOINTS.L1_RPC, blockNumber),
  sendRawTransaction: (signedTx: string) => sendRawTransaction(RPC_ENDPOINTS.L1_RPC, signedTx),
};

export const l2 = {
  getBlockNumber: () => getBlockNumber(RPC_ENDPOINTS.L2_RPC),
  getChainId: () => getChainId(RPC_ENDPOINTS.L2_RPC),
  getGasPrice: () => getGasPrice(RPC_ENDPOINTS.L2_RPC),
  getBalance: (address: string) => getBalance(RPC_ENDPOINTS.L2_RPC, address),
  getTransactionCount: (address: string, blockTag?: "latest" | "pending") => getTransactionCount(RPC_ENDPOINTS.L2_RPC, address, blockTag),
  getBlockByNumber: (blockNumber: number | "latest") =>
    getBlockByNumber(RPC_ENDPOINTS.L2_RPC, blockNumber),
  getTransactionReceipt: (txHash: string) => getTransactionReceipt(RPC_ENDPOINTS.L2_RPC, txHash),
  getTransactionByHash: (txHash: string) => getTransactionByHash(RPC_ENDPOINTS.L2_RPC, txHash),
  getCode: (address: string) => getCode(RPC_ENDPOINTS.L2_RPC, address),
};

export interface BuilderStatus {
  blockTimeMs: number;
  skipEmptyBlocks: boolean;
  sequencerAddress: string;
  pendingTxCount: number;
  stressThresholdPct?: number;
  blocksBuilt?: number;
  txsProcessed?: number;
  avgBuildTimeMs?: number;
}

export async function getBuilderStatus(): Promise<BuilderStatus> {
  const response = await fetch(`${RPC_ENDPOINTS.BUILDER_RPC}/status`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch builder status: ${response.statusText}`);
  }
  const data = await response.json();
  if (!data || typeof data !== 'object' ||
      typeof data.blockTimeMs !== 'number' ||
      typeof data.skipEmptyBlocks !== 'boolean' ||
      typeof data.sequencerAddress !== 'string' ||
      typeof data.pendingTxCount !== 'number') {
    throw new Error('Invalid builder status response');
  }
  return data as BuilderStatus;
}

export const builder = {
  getChainId: () => getChainId(RPC_ENDPOINTS.BUILDER_RPC),
  sendRawTransaction: (signedTx: string) =>
    sendRawTransaction(RPC_ENDPOINTS.BUILDER_RPC, signedTx),
  getStatus: () => getBuilderStatus(),
};

export interface BlobDABlob {
  id: number;
  startBatch: number;
  endBatch: number;
  compression: number;
  blobHash: string;
  createdAt: string;
}

export const blobDA = {
  getBlobs: (limit: number, offset: number) =>
    rpcCall<BlobDABlob[]>(RPC_ENDPOINTS.BLOB_DA_RPC, "data_getOffChainBlobs", [limit, offset]),
};
