import { Wallet, parseEther, Transaction } from "ethers";
import { TEST_ACCOUNT, RECIPIENT_ADDRESS, CHAIN_IDS } from "@/types/chain";
import { l1, l2, builder } from "./rpc-client";
import type { TransactionType, DeployedContracts } from "@/types/load-test";
import { buildTransactionTemplate } from "./transaction-templates";

// Local nonce tracker to handle rapid successive sends
// Since transactions go to the block builder (not L2 mempool), "pending" nonce from L2 won't reflect builder's queue
class NonceTracker {
  private l2Nonce: number | null = null;
  private l1Nonce: number | null = null;
  private l2LastFetch = 0;
  private l1LastFetch = 0;
  private readonly REFRESH_INTERVAL = 5000; // Refresh from network every 5 seconds

  async getL2Nonce(): Promise<number> {
    const now = Date.now();
    // Refresh from network if stale or never fetched
    if (this.l2Nonce === null || now - this.l2LastFetch > this.REFRESH_INTERVAL) {
      this.l2Nonce = await l2.getTransactionCount(TEST_ACCOUNT.address);
      this.l2LastFetch = now;
    }
    return this.l2Nonce++;
  }

  async getL1Nonce(): Promise<number> {
    const now = Date.now();
    if (this.l1Nonce === null || now - this.l1LastFetch > this.REFRESH_INTERVAL) {
      this.l1Nonce = await l1.getTransactionCount(TEST_ACCOUNT.address);
      this.l1LastFetch = now;
    }
    return this.l1Nonce++;
  }

  // Force refresh from network (call after errors or long gaps)
  reset() {
    this.l2Nonce = null;
    this.l1Nonce = null;
  }
}

const nonceTracker = new NonceTracker();

export interface TransactionParams {
  to?: string;
  value?: bigint;
  data?: string;
  gasLimit?: number;
  gasPrice?: bigint;
  nonce?: number;
  chainId?: bigint;
}

export interface TypedTransactionParams {
  transactionType: TransactionType;
  contracts: DeployedContracts;
  nonce?: number;
  gasPrice?: bigint;
}

const wallet = new Wallet(TEST_ACCOUNT.privateKey);

// Default gas price to use (1 gwei) - avoids L2 gas price estimation which requires L1Block contract
const DEFAULT_GAS_PRICE = BigInt(1_000_000_000);

export async function buildSignedTransaction(params: TransactionParams = {}): Promise<{
  signedTx: string;
  nonce: number;
}> {
  // Get nonce from tracker if not provided - handles rapid successive sends
  const nonce = params.nonce ?? (await nonceTracker.getL2Nonce());
  const gasPrice = params.gasPrice ?? DEFAULT_GAS_PRICE;

  const tx = Transaction.from({
    to: params.to ?? RECIPIENT_ADDRESS,
    value: params.value ?? parseEther("1"),
    data: params.data ?? "0x",
    gasLimit: params.gasLimit ?? 21000,
    gasPrice,
    nonce,
    chainId: params.chainId ?? CHAIN_IDS.L2,
    type: 0, // Legacy transaction
  });

  const signedTx = await wallet.signTransaction(tx);

  return { signedTx, nonce };
}

export async function sendL2Transaction(params: TransactionParams = {}): Promise<{
  txHash: string;
  nonce: number;
  submittedAt: number;
}> {
  const { signedTx, nonce } = await buildSignedTransaction(params);
  const submittedAt = Date.now();
  const txHash = await builder.sendRawTransaction(signedTx);

  return { txHash, nonce, submittedAt };
}

export async function sendTypedL2Transaction(params: TypedTransactionParams): Promise<{
  txHash: string;
  nonce: number;
  submittedAt: number;
}> {
  const nonce = params.nonce ?? (await nonceTracker.getL2Nonce());
  const gasPrice = params.gasPrice ?? DEFAULT_GAS_PRICE;

  // Get transaction template for the type
  const template = buildTransactionTemplate(params.transactionType, params.contracts, nonce);

  const tx = Transaction.from({
    to: template.to,
    value: template.value,
    data: template.data,
    gasLimit: template.gasLimit,
    gasPrice,
    nonce,
    chainId: CHAIN_IDS.L2,
    type: 0,
  });

  const signedTx = await wallet.signTransaction(tx);
  const submittedAt = Date.now();
  const txHash = await builder.sendRawTransaction(signedTx);

  return { txHash, nonce, submittedAt };
}

export async function sendL1Transaction(params: TransactionParams = {}): Promise<{
  txHash: string;
  nonce: number;
  submittedAt: number;
}> {
  const nonce = params.nonce ?? (await nonceTracker.getL1Nonce());
  const gasPrice = params.gasPrice ?? (await l1.getGasPrice());

  const tx = Transaction.from({
    to: params.to ?? RECIPIENT_ADDRESS,
    value: params.value ?? parseEther("1"),
    gasLimit: params.gasLimit ?? 21000,
    gasPrice,
    nonce,
    chainId: CHAIN_IDS.L1,
    type: 0,
  });

  const signedTx = await wallet.signTransaction(tx);
  const submittedAt = Date.now();
  const txHash = await l1.sendRawTransaction(signedTx);

  return { txHash, nonce, submittedAt };
}

// Build multiple signed transactions with sequential nonces
export async function buildBatchTransactions(
  count: number,
  params: Omit<TransactionParams, "nonce"> = {}
): Promise<Array<{ signedTx: string; nonce: number }>> {
  // Get first nonce from tracker, then increment locally for the batch
  const startNonce = await nonceTracker.getL2Nonce();
  // Reserve remaining nonces by getting them from tracker (increments internal counter)
  for (let i = 1; i < count; i++) {
    await nonceTracker.getL2Nonce();
  }
  const gasPrice = params.gasPrice ?? DEFAULT_GAS_PRICE;

  const transactions: Array<{ signedTx: string; nonce: number }> = [];

  for (let i = 0; i < count; i++) {
    const nonce = startNonce + i;
    const tx = Transaction.from({
      to: params.to ?? RECIPIENT_ADDRESS,
      value: params.value ?? parseEther("1"),
      gasLimit: params.gasLimit ?? 21000,
      gasPrice,
      nonce,
      chainId: params.chainId ?? CHAIN_IDS.L2,
      type: 0,
    });

    const signedTx = await wallet.signTransaction(tx);
    transactions.push({ signedTx, nonce });
  }

  return transactions;
}

// Export function to reset nonce tracker (useful after errors or manual intervention)
export function resetNonceTracker() {
  nonceTracker.reset();
}
