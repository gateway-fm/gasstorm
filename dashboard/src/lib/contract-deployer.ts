import { Transaction, Wallet } from "ethers";
import { TEST_ACCOUNT, CHAIN_IDS } from "@/types/chain";
import { l2, builder } from "./rpc-client";
import type { DeployedContracts } from "@/types/load-test";

const wallet = new Wallet(TEST_ACCOUNT.privateKey);
// Default gas price to use (1 gwei) - avoids L2 gas price estimation
const DEFAULT_GAS_PRICE = BigInt(1_000_000_000);
const STORAGE_KEY = "loadtest-contracts";

// Test ERC20 contract bytecode - realistic gas (~65k), never reverts
// Uses unchecked arithmetic to prevent underflow reverts
// Solidity (0.8.20):
// contract ERC20 {
//   mapping(address => uint256) public balanceOf;
//   mapping(address => mapping(address => uint256)) public allowance;
//   uint256 public totalSupply;
//   constructor() { totalSupply = type(uint256).max; }
//   function transfer(address to, uint256 amount) external returns (bool) {
//     unchecked { balanceOf[msg.sender] -= amount; balanceOf[to] += amount; }
//     emit Transfer(msg.sender, to, amount); return true;
//   }
//   function approve(address spender, uint256 amount) external returns (bool) {
//     allowance[msg.sender][spender] = amount;
//     emit Approval(msg.sender, spender, amount); return true;
//   }
//   function transferFrom(address from, address to, uint256 amount) external returns (bool) {
//     unchecked { allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount; }
//     emit Transfer(from, to, amount); return true;
//   }
// }
const ERC20_BYTECODE =
  "0x608060405234801561000f575f80fd5b507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff60028190555061073c806100445f395ff3fe608060405234801561000f575f80fd5b5060043610610060575f3560e01c8063095ea7b31461006457806318160ddd1461009457806323b872dd146100b257806370a08231146100e2578063a9059cbb14610112578063dd62ed3e14610142575b5f80fd5b61007e600480360381019061007991906105b4565b610172565b60405161008b919061060c565b60405180910390f35b61009c61025f565b6040516100a99190610634565b60405180910390f35b6100cc60048036038101906100c7919061064d565b610265565b6040516100d9919061060c565b60405180910390f35b6100fc60048036038101906100f7919061069d565b6103ed565b6040516101099190610634565b60405180910390f35b61012c600480360381019061012791906105b4565b610401565b604051610139919061060c565b60405180910390f35b61015c600480360381019061015791906106c8565b610503565b6040516101699190610634565b60405180910390f35b5f8160015f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f20819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b9258460405161024d9190610634565b60405180910390a36001905092915050565b60025481565b5f8160015f8673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8282540392505081905550815f808673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8282540392505081905550815f808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f82825401925050819055508273ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040516103da9190610634565b60405180910390a3600190509392505050565b5f602052805f5260405f205f915090505481565b5f815f803373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8282540392505081905550815f808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f82825401925050819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040516104f19190610634565b60405180910390a36001905092915050565b6001602052815f5260405f20602052805f5260405f205f91509150505481565b5f80fd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61055082610527565b9050919050565b61056081610546565b811461056a575f80fd5b50565b5f8135905061057b81610557565b92915050565b5f819050919050565b61059381610581565b811461059d575f80fd5b50565b5f813590506105ae8161058a565b92915050565b5f80604083850312156105ca576105c9610523565b5b5f6105d78582860161056d565b92505060206105e8858286016105a0565b9150509250929050565b5f8115159050919050565b610606816105f2565b82525050565b5f60208201905061061f5f8301846105fd565b92915050565b61062e81610581565b82525050565b5f6020820190506106475f830184610625565b92915050565b5f805f6060848603121561066457610663610523565b5b5f6106718682870161056d565b93505060206106828682870161056d565b9250506040610693868287016105a0565b9150509250925092565b5f602082840312156106b2576106b1610523565b5b5f6106bf8482850161056d565b91505092915050565b5f80604083850312156106de576106dd610523565b5b5f6106eb8582860161056d565b92505060206106fc8582860161056d565b915050925092905056fea26469706673582212203bf5cd39aee51811d687054a175115ba0eb43348972e4375ad2d0b659a764d4564736f6c63430008140033";

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
    case "erc721-transfer":
      return !contracts.nft;
    case "uniswap-swap":
      return !contracts.simpleSwap || !contracts.erc20;
    case "storage-write":
    case "heavy-compute":
      return !contracts.gasConsumer;
    default:
      return false;
  }
}
