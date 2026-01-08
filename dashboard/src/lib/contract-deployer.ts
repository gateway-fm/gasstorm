import { Transaction, Wallet } from "ethers";
import { TEST_ACCOUNT, CHAIN_IDS } from "@/types/chain";
import { l2, builder } from "./rpc-client";
import type { DeployedContracts } from "@/types/load-test";

const wallet = new Wallet(TEST_ACCOUNT.privateKey);
// Default gas price to use (1 gwei) - avoids L2 gas price estimation
const DEFAULT_GAS_PRICE = BigInt(1_000_000_000);
const STORAGE_KEY = "loadtest-contracts";

// Minimal ERC20 contract bytecode
// Solidity (simplified):
// contract TestERC20 {
//   mapping(address => uint256) public balanceOf;
//   mapping(address => mapping(address => uint256)) public allowance;
//   constructor() { balanceOf[msg.sender] = 10**30; }
//   function transfer(address to, uint256 amount) external returns (bool) {
//     balanceOf[msg.sender] -= amount;
//     balanceOf[to] += amount;
//     return true;
//   }
//   function approve(address spender, uint256 amount) external returns (bool) {
//     allowance[msg.sender][spender] = amount;
//     return true;
//   }
// }
const ERC20_BYTECODE =
  "0x608060405234801561001057600080fd5b506c0c9f2c9cd04674edea40000000600080336001600160a01b03166001600160a01b03168152602001908152602001600020819055506102e3806100566000396000f3fe608060405234801561001057600080fd5b506004361061004c5760003560e01c8063095ea7b31461005157806323b872dd1461008157806370a08231146100b1578063a9059cbb146100e1575b600080fd5b61006b60048036038101906100669190610233565b610111565b6040516100789190610288565b60405180910390f35b61009b600480360381019061009691906102a3565b610175565b6040516100a89190610288565b60405180910390f35b6100cb60048036038101906100c691906102f6565b6101db565b6040516100d89190610323565b60405180910390f35b6100fb60048036038101906100f69190610233565b6101f3565b6040516101089190610288565b60405180910390f35b600081600160003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055506001905092915050565b60006101828484846101f3565b506001905092915050565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b600081600080336001600160a01b031681526020019081526020016000206000828254610203919061036d565b9250508190555081600080856001600160a01b031681526020019081526020016000206000828254610235919061039a565b925050819055506001905092915050565b6000806040838503121561024657600080fd5b8235915060208301356001600160a01b038116811461026457600080fd5b809150509250929050565b8035801515811461027f57600080fd5b919050565b60006020828403121561029657600080fd5b61029f8261026f565b9392505050565b6000806000606084860312156102b857600080fd5b83356001600160a01b03811681146102cf57600080fd5b92506020840135915060408401356001600160a01b03811681146102f257600080fd5b809150509250925092565b60006020828403121561030857600080fd5b81356001600160a01b038116811461031f57600080fd5b9392505050565b6000602082840312156101e357600080fd5b60008282101561034857610348610387565b500390565b600082198211156101e3576101e3610387565b634e487b7160e01b600052601160045260246000fd5b8181038181111561038057610380610360565b9250929050565b634e487b7160e01b600052601160045260246000fd5b808201808211156103b0576103b0610360565b9291505056fea164736f6c634300080f000a";

// SimpleSwap contract bytecode
// Solidity (simplified):
// contract SimpleSwap {
//   uint256 public totalSwapped;
//   function swap(uint256 amount) external payable {
//     // Simulate swap by doing some storage writes and computation
//     totalSwapped += amount;
//     for (uint i = 0; i < 10; i++) {
//       keccak256(abi.encodePacked(amount, i));
//     }
//   }
// }
const SIMPLE_SWAP_BYTECODE =
  "0x608060405234801561001057600080fd5b50610200806100206000396000f3fe60806040526004361061002d5760003560e01c806394b918de14610032578063c4e41b2214610047575b600080fd5b610045610040366004610142565b610072565b005b34801561005357600080fd5b5061005c600081565b604051610069919061015b565b60405180910390f35b80600080828254610083919061016a565b9091555060009050805b600a8110156100fa5782816040516020016100a9929190610183565b60408051601f19818403018152908290526100c3916101a9565b602060405180830381855afa1580156100e0573d6000803e3d6000fd5b5050506040513d60208110156100f557600080fd5b50506001016100d5565b505050565b600060208284031215610110578081fd5b5035919050565b60008219821115610138577f4e487b710000000000000000000000000000000000000000000000000000000081526011600452602481fd5b500190565b60006020828403121561015357600080fd5b5051919050565b90815260200190565b8082018082111561017e5761017e61011f565b92915050565b8281526020810182905260400190565b6000825161019f818460208701610165565b9190910192915050565b6000825161019f81846020870161016556fea164736f6c634300080f000a";

// GasConsumer contract bytecode
// Solidity (simplified):
// contract GasConsumer {
//   mapping(uint256 => uint256) public data;
//   uint256 public counter;
//   function write(uint256 value) external {
//     data[counter] = value;
//     counter++;
//   }
//   function burn(uint256 iterations) external {
//     bytes32 h = keccak256(abi.encodePacked(iterations));
//     for (uint256 i = 0; i < iterations; i++) {
//       h = keccak256(abi.encodePacked(h));
//     }
//     data[counter] = uint256(h);
//     counter++;
//   }
// }
const GAS_CONSUMER_BYTECODE =
  "0x608060405234801561001057600080fd5b506102c4806100206000396000f3fe608060405234801561001057600080fd5b50600436106100415760003560e01c806361bc221a14610046578063902b597914610064578063f971825014610079575b600080fd5b61004e61008c565b60405161005b919061020a565b60405180910390f35b610077610072366004610213565b610092565b005b610077610087366004610213565b6100d7565b60015481565b806000806001548152602001908152602001600020819055506001600081548092919061010690610254565b919050555050565b600081604051602001610111919061020a565b60408051601f1981840301815290829052805160209091012091505b8281101561017a5780604051602001610146919061020a565b60408051601f198184030181529082905261016091610225565b602060405180830381855afa15801561017d573d6000803e3d6000fd5b5050506040513d602081101561019257600080fd5b505160010161012d565b5080600080600154815260200190815260200160002081905550600160008154809291906101a790610254565b91905055505050565b600060208284031215610211578081fd5b5051919050565b6000602082840312156101e657600080fd5b5035919050565b90815260200190565b600082516101fd81846020870161023c565b9190910192915050565b6000825161019f81846020870161023c565b60005b8381101561023457818101518382015260200161021c565b50505050505050565b7f4e487b710000000000000000000000000000000000000000000000000000000081526011600452602481fd5b60006001820161028457610284610225565b506001019056fea164736f6c634300080f000a";

// Load deployed contracts from localStorage
export function loadDeployedContracts(): DeployedContracts | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY}-${CHAIN_IDS.L2}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

// Save deployed contracts to localStorage
function saveDeployedContracts(contracts: DeployedContracts): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${STORAGE_KEY}-${CHAIN_IDS.L2}`, JSON.stringify(contracts));
}

// Deploy a contract and return its address
async function deployContract(bytecode: string): Promise<string> {
  const nonce = await l2.getTransactionCount(TEST_ACCOUNT.address);

  const tx = Transaction.from({
    data: bytecode,
    gasLimit: 3000000, // High limit for deployment
    gasPrice: DEFAULT_GAS_PRICE,
    nonce,
    chainId: CHAIN_IDS.L2,
    type: 0,
  });

  const signedTx = await wallet.signTransaction(tx);
  const txHash = await builder.sendRawTransaction(signedTx);

  // Wait for receipt
  let receipt = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    receipt = await l2.getTransactionReceipt(txHash);
    if (receipt) break;
  }

  if (!receipt || !receipt.contractAddress) {
    throw new Error(`Contract deployment failed: ${txHash}`);
  }

  return receipt.contractAddress;
}

// Deploy all required contracts
export async function deployContracts(
  onProgress?: (message: string) => void
): Promise<DeployedContracts> {
  const existing = loadDeployedContracts();

  // Check if contracts are still valid (deployed on chain)
  if (existing?.erc20) {
    try {
      const code = await l2.getCode(existing.erc20);
      if (code && code !== "0x") {
        onProgress?.("Using existing deployed contracts");
        return existing;
      }
    } catch {
      // Contract not found, redeploy
    }
  }

  const contracts: DeployedContracts = {
    deployedAt: Date.now(),
  };

  onProgress?.("Deploying TestERC20...");
  contracts.erc20 = await deployContract(ERC20_BYTECODE);
  onProgress?.(`TestERC20 deployed at ${contracts.erc20}`);

  // Small delay between deployments
  await new Promise((r) => setTimeout(r, 1000));

  onProgress?.("Deploying SimpleSwap...");
  contracts.simpleSwap = await deployContract(SIMPLE_SWAP_BYTECODE);
  onProgress?.(`SimpleSwap deployed at ${contracts.simpleSwap}`);

  await new Promise((r) => setTimeout(r, 1000));

  onProgress?.("Deploying GasConsumer...");
  contracts.gasConsumer = await deployContract(GAS_CONSUMER_BYTECODE);
  onProgress?.(`GasConsumer deployed at ${contracts.gasConsumer}`);

  saveDeployedContracts(contracts);
  onProgress?.("All contracts deployed successfully!");

  return contracts;
}

// Check if contracts need to be deployed for a transaction type
export function needsDeployment(
  type: string,
  contracts: DeployedContracts | null
): boolean {
  if (type === "eth-transfer") return false;
  if (!contracts) return true;

  switch (type) {
    case "erc20-transfer":
    case "erc20-approve":
      return !contracts.erc20;
    case "uniswap-swap":
      return !contracts.simpleSwap || !contracts.erc20;
    case "storage-write":
    case "heavy-compute":
      return !contracts.gasConsumer;
    default:
      return false;
  }
}
