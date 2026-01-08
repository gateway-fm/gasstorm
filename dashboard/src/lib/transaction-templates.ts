import { AbiCoder, keccak256, toUtf8Bytes } from "ethers";
import type { TransactionType, DeployedContracts } from "@/types/load-test";
import { RECIPIENT_ADDRESS } from "@/types/chain";

const abiCoder = AbiCoder.defaultAbiCoder();

// Function selectors (first 4 bytes of keccak256 hash of function signature)
const SELECTORS = {
  // ERC20
  transfer: keccak256(toUtf8Bytes("transfer(address,uint256)")).slice(0, 10),
  approve: keccak256(toUtf8Bytes("approve(address,uint256)")).slice(0, 10),
  // SimpleSwap
  swap: keccak256(toUtf8Bytes("swap(uint256)")).slice(0, 10),
  // StorageWriter
  write: keccak256(toUtf8Bytes("write(uint256)")).slice(0, 10),
  // GasConsumer
  burn: keccak256(toUtf8Bytes("burn(uint256)")).slice(0, 10),
};

// Gas limits for each transaction type
export const GAS_LIMITS: Record<TransactionType, number> = {
  "eth-transfer": 21000,
  "erc20-transfer": 80000,
  "erc20-approve": 60000,
  "uniswap-swap": 200000,
  "storage-write": 50000,
  "heavy-compute": 500000,
};

export interface TransactionTemplate {
  to: string;
  data: string;
  value: bigint;
  gasLimit: number;
}

// Build ERC20 transfer calldata
function buildErc20Transfer(tokenAddress: string, recipient: string, amount: bigint): string {
  const params = abiCoder.encode(["address", "uint256"], [recipient, amount]);
  return SELECTORS.transfer + params.slice(2);
}

// Build ERC20 approve calldata
function buildErc20Approve(tokenAddress: string, spender: string, amount: bigint): string {
  const params = abiCoder.encode(["address", "uint256"], [spender, amount]);
  return SELECTORS.approve + params.slice(2);
}

// Build swap calldata (simplified - just takes amount to swap)
function buildSwap(amount: bigint): string {
  const params = abiCoder.encode(["uint256"], [amount]);
  return SELECTORS.swap + params.slice(2);
}

// Build storage write calldata
function buildStorageWrite(value: bigint): string {
  const params = abiCoder.encode(["uint256"], [value]);
  return SELECTORS.write + params.slice(2);
}

// Build gas burn calldata (iterations determines gas used)
function buildGasBurn(iterations: bigint): string {
  const params = abiCoder.encode(["uint256"], [iterations]);
  return SELECTORS.burn + params.slice(2);
}

export function buildTransactionTemplate(
  type: TransactionType,
  contracts: DeployedContracts,
  nonce: number
): TransactionTemplate {
  switch (type) {
    case "eth-transfer":
      return {
        to: RECIPIENT_ADDRESS,
        data: "0x",
        value: 1000000000000000n, // 0.001 ETH
        gasLimit: GAS_LIMITS["eth-transfer"],
      };

    case "erc20-transfer":
      if (!contracts.erc20) throw new Error("ERC20 contract not deployed");
      return {
        to: contracts.erc20,
        data: buildErc20Transfer(contracts.erc20, RECIPIENT_ADDRESS, 1000000n), // 1 token (6 decimals)
        value: 0n,
        gasLimit: GAS_LIMITS["erc20-transfer"],
      };

    case "erc20-approve":
      if (!contracts.erc20) throw new Error("ERC20 contract not deployed");
      return {
        to: contracts.erc20,
        data: buildErc20Approve(contracts.erc20, RECIPIENT_ADDRESS, 1000000000000n), // Large approval
        value: 0n,
        gasLimit: GAS_LIMITS["erc20-approve"],
      };

    case "uniswap-swap":
      if (!contracts.simpleSwap) throw new Error("SimpleSwap contract not deployed");
      return {
        to: contracts.simpleSwap,
        data: buildSwap(1000000n),
        value: 1000000000000000n, // 0.001 ETH for swap
        gasLimit: GAS_LIMITS["uniswap-swap"],
      };

    case "storage-write":
      if (!contracts.gasConsumer) throw new Error("GasConsumer contract not deployed");
      // Use nonce to write different values each time
      return {
        to: contracts.gasConsumer,
        data: buildStorageWrite(BigInt(nonce)),
        value: 0n,
        gasLimit: GAS_LIMITS["storage-write"],
      };

    case "heavy-compute":
      if (!contracts.gasConsumer) throw new Error("GasConsumer contract not deployed");
      // ~100 iterations uses about 500k gas
      return {
        to: contracts.gasConsumer,
        data: buildGasBurn(100n),
        value: 0n,
        gasLimit: GAS_LIMITS["heavy-compute"],
      };

    default:
      throw new Error(`Unknown transaction type: ${type}`);
  }
}

// Check which contracts are needed for a transaction type
export function getRequiredContracts(type: TransactionType): (keyof DeployedContracts)[] {
  switch (type) {
    case "eth-transfer":
      return [];
    case "erc20-transfer":
    case "erc20-approve":
      return ["erc20"];
    case "uniswap-swap":
      return ["simpleSwap", "erc20"];
    case "storage-write":
    case "heavy-compute":
      return ["gasConsumer"];
    default:
      return [];
  }
}
