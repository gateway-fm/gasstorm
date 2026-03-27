#!/usr/bin/env node
/**
 * Deploy Hyperlane warp routes using the SDK directly.
 * This handles both native ETH and ERC20 (collateral/synthetic) warp routes.
 *
 * Environment:
 *   REGISTRY_PATH  - Path to local Hyperlane registry (~/.hyperlane)
 *   L1_CHAIN_NAME  - L1 chain name (e.g., besulocal)
 *   L2_CHAIN_NAME  - L2 chain name (e.g., l2local)
 *   HYP_KEY        - Deployer private key
 *   MOCK_USDC_ADDR - MockUSDC address on L1 (for ERC20 collateral route)
 *   OUTPUT_FILE    - Path to write deployed addresses JSON
 */

import { ethers } from 'ethers';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';

const {
  REGISTRY_PATH = `${process.env.HOME}/.hyperlane`,
  L1_CHAIN_NAME = 'l1local',
  L2_CHAIN_NAME = 'l2local',
  HYP_KEY,
  MOCK_USDC_ADDR = '',
  OUTPUT_FILE = '/output/warp-addresses.json',
} = process.env;

if (!HYP_KEY) {
  console.error('HYP_KEY is required');
  process.exit(1);
}

// Read chain metadata from registry
function readChainMeta(chainName) {
  const metaPath = join(REGISTRY_PATH, 'chains', chainName, 'metadata.yaml');
  if (!existsSync(metaPath)) throw new Error(`Chain metadata not found: ${metaPath}`);
  return YAML.parse(readFileSync(metaPath, 'utf-8'));
}

// Read deployed core addresses from registry
function readCoreAddresses(chainName) {
  const addrPath = join(REGISTRY_PATH, 'chains', chainName, 'addresses.yaml');
  if (!existsSync(addrPath)) throw new Error(`Core addresses not found: ${addrPath}`);
  return YAML.parse(readFileSync(addrPath, 'utf-8'));
}

// HypNative ABI (minimal for deployment)
const HYP_NATIVE_ABI = [
  'constructor(uint256 _scale, address _mailbox)',
  'function initialize(address _hook, address _interchainSecurityModule, address _owner) external',
  'function enrollRemoteRouter(uint32 _domain, bytes32 _router) external',
  'function routers(uint32 domain) view returns (bytes32)',
  'function transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount) payable returns (bytes32)',
  'function mailbox() view returns (address)',
  'function localDomain() view returns (uint32)',
  'function balanceOf(address) view returns (uint256)',
  'receive() external payable',
];

// HypERC20Collateral ABI
const HYP_COLLATERAL_ABI = [
  'constructor(address _erc20, uint256 _scale, address _mailbox)',
  'function initialize(address _hook, address _interchainSecurityModule, address _owner) external',
  'function enrollRemoteRouter(uint32 _domain, bytes32 _router) external',
  'function routers(uint32 domain) view returns (bytes32)',
  'function transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount) payable returns (bytes32)',
  'function wrappedToken() view returns (address)',
];

// HypERC20 (Synthetic) ABI
const HYP_SYNTHETIC_ABI = [
  'constructor(uint8 _decimals, uint256 _scale, address _mailbox)',
  'function initialize(uint256 _totalSupply, string _name, string _symbol, address _hook, address _interchainSecurityModule, address _owner) external',
  'function enrollRemoteRouter(uint32 _domain, bytes32 _router) external',
  'function routers(uint32 domain) view returns (bytes32)',
  'function transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount) payable returns (bytes32)',
  'function balanceOf(address) view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
];

async function main() {
  const l1Meta = readChainMeta(L1_CHAIN_NAME);
  const l2Meta = readChainMeta(L2_CHAIN_NAME);
  const l1Core = readCoreAddresses(L1_CHAIN_NAME);
  const l2Core = readCoreAddresses(L2_CHAIN_NAME);

  const l1Rpc = l1Meta.rpcUrls[0].http;
  const l2Rpc = l2Meta.rpcUrls[0].http;

  console.log(`L1 (${L1_CHAIN_NAME}): ${l1Rpc}, mailbox: ${l1Core.mailbox}`);
  console.log(`L2 (${L2_CHAIN_NAME}): ${l2Rpc}, mailbox: ${l2Core.mailbox}`);

  const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
  const l2Provider = new ethers.JsonRpcProvider(l2Rpc);
  const l1Wallet = new ethers.Wallet(HYP_KEY, l1Provider);
  const l2Wallet = new ethers.Wallet(HYP_KEY, l2Provider);
  const deployer = l1Wallet.address;

  console.log(`Deployer: ${deployer}`);

  // Get bytecodes from the Hyperlane CLI package
  const cliPkgPath = '/usr/local/lib/node_modules/@hyperlane-xyz/cli';
  const sdkPath = join(cliPkgPath, 'node_modules', '@hyperlane-xyz', 'core');

  // We'll use simple CREATE2-free deployment via ethers ContractFactory
  // For warp routes, we deploy lightweight HypNative contracts from our own src/
  // since the SDK's are proxy-based and more complex

  const result = {
    ethWarpL1: '',
    ethWarpL2: '',
    erc20WarpL1: '',
    erc20WarpL2: '',
  };

  // --- Deploy ETH warp routes using our HypNativeSimple contracts ---
  // These are simpler than the SDK's proxy-based contracts but work with the relayer
  console.log('\n--- Deploying ETH warp routes (HypNativeSimple) ---');

  const HypNativeSimpleBytecode = JSON.parse(
    readFileSync('/app/out/HypNativeSimple.sol/HypNativeSimple.json', 'utf-8')
  ).bytecode.object;

  const HypNativeSimpleABI = [
    'constructor(address _mailbox, uint32 _localDomain)',
    'function enrollRemoteRouter(uint32 domain, bytes32 router) external',
    'function transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount) payable returns (bytes32)',
    'function routers(uint32) view returns (bytes32)',
    'receive() external payable',
  ];

  // Deploy on L1
  console.log('Deploying HypNativeSimple on L1...');
  const l1EthFactory = new ethers.ContractFactory(HypNativeSimpleABI, HypNativeSimpleBytecode, l1Wallet);
  const l1Eth = await l1EthFactory.deploy(l1Core.mailbox, l1Meta.domainId);
  await l1Eth.waitForDeployment();
  result.ethWarpL1 = await l1Eth.getAddress();
  console.log(`  L1 ETH warp: ${result.ethWarpL1}`);

  // Deploy on L2
  console.log('Deploying HypNativeSimple on L2...');
  const l2EthFactory = new ethers.ContractFactory(HypNativeSimpleABI, HypNativeSimpleBytecode, l2Wallet);
  const l2Eth = await l2EthFactory.deploy(l2Core.mailbox, l2Meta.domainId);
  await l2Eth.waitForDeployment();
  result.ethWarpL2 = await l2Eth.getAddress();
  console.log(`  L2 ETH warp: ${result.ethWarpL2}`);

  // Enroll routers
  console.log('Enrolling ETH routers...');
  const l1EthContract = new ethers.Contract(result.ethWarpL1, HypNativeSimpleABI, l1Wallet);
  const l2EthContract = new ethers.Contract(result.ethWarpL2, HypNativeSimpleABI, l2Wallet);
  const l2RouterBytes32 = ethers.zeroPadValue(result.ethWarpL2, 32);
  const l1RouterBytes32 = ethers.zeroPadValue(result.ethWarpL1, 32);

  await (await l1EthContract.enrollRemoteRouter(l2Meta.domainId, l2RouterBytes32)).wait();
  await (await l2EthContract.enrollRemoteRouter(l1Meta.domainId, l1RouterBytes32)).wait();
  console.log('  Routers enrolled');

  // Fund ETH warp routes
  console.log('Funding ETH warp routes...');
  await (await l1Wallet.sendTransaction({ to: result.ethWarpL1, value: ethers.parseEther('10') })).wait();
  await (await l2Wallet.sendTransaction({ to: result.ethWarpL2, value: ethers.parseEther('10') })).wait();
  console.log('  Funded with 10 ETH each');

  // --- Deploy ERC20 warp routes ---
  if (MOCK_USDC_ADDR) {
    console.log('\n--- Deploying ERC20 warp routes ---');

    const HypERC20CollateralBytecode = JSON.parse(
      readFileSync('/app/out/HypERC20Collateral.sol/HypERC20Collateral.json', 'utf-8')
    ).bytecode.object;

    const HypERC20SyntheticBytecode = JSON.parse(
      readFileSync('/app/out/HypERC20Synthetic.sol/HypERC20Synthetic.json', 'utf-8')
    ).bytecode.object;

    const CollateralABI = [
      'constructor(address _token, address _mailbox, uint32 _localDomain)',
      'function enrollRemoteRouter(uint32 domain, bytes32 router) external',
      'function transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount) payable returns (bytes32)',
      'function routers(uint32) view returns (bytes32)',
    ];

    const SyntheticABI = [
      'constructor(string _name, string _symbol, uint8 _decimals, address _mailbox, uint32 _localDomain)',
      'function enrollRemoteRouter(uint32 domain, bytes32 router) external',
      'function transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount) payable returns (bytes32)',
      'function routers(uint32) view returns (bytes32)',
      'function balanceOf(address) view returns (uint256)',
    ];

    // Deploy collateral on L1
    console.log('Deploying HypERC20Collateral on L1...');
    const l1ColFactory = new ethers.ContractFactory(CollateralABI, HypERC20CollateralBytecode, l1Wallet);
    const l1Col = await l1ColFactory.deploy(MOCK_USDC_ADDR, l1Core.mailbox, l1Meta.domainId);
    await l1Col.waitForDeployment();
    result.erc20WarpL1 = await l1Col.getAddress();
    console.log(`  L1 ERC20 collateral: ${result.erc20WarpL1}`);

    // Deploy synthetic on L2
    console.log('Deploying HypERC20Synthetic on L2...');
    const l2SynFactory = new ethers.ContractFactory(SyntheticABI, HypERC20SyntheticBytecode, l2Wallet);
    const l2Syn = await l2SynFactory.deploy('USD Coin', 'USDC', 6, l2Core.mailbox, l2Meta.domainId);
    await l2Syn.waitForDeployment();
    result.erc20WarpL2 = await l2Syn.getAddress();
    console.log(`  L2 ERC20 synthetic: ${result.erc20WarpL2}`);

    // Enroll routers
    console.log('Enrolling ERC20 routers...');
    const l1ColContract = new ethers.Contract(result.erc20WarpL1, CollateralABI, l1Wallet);
    const l2SynContract = new ethers.Contract(result.erc20WarpL2, SyntheticABI, l2Wallet);
    const l2Erc20Bytes32 = ethers.zeroPadValue(result.erc20WarpL2, 32);
    const l1Erc20Bytes32 = ethers.zeroPadValue(result.erc20WarpL1, 32);

    await (await l1ColContract.enrollRemoteRouter(l2Meta.domainId, l2Erc20Bytes32)).wait();
    await (await l2SynContract.enrollRemoteRouter(l1Meta.domainId, l1Erc20Bytes32)).wait();
    console.log('  Routers enrolled');

    // Fund collateral with USDC
    console.log('Funding collateral with USDC...');
    const usdcABI = ['function transfer(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'];
    const usdc = new ethers.Contract(MOCK_USDC_ADDR, usdcABI, l1Wallet);
    await (await usdc.transfer(result.erc20WarpL1, 500_000n * 10n ** 6n)).wait();
    const balance = await usdc.balanceOf(result.erc20WarpL1);
    console.log(`  Collateral funded with ${balance / 10n ** 6n} USDC`);
  }

  // Write results
  writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  console.log(`\nWarp addresses written to ${OUTPUT_FILE}`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Warp deployment failed:', err.message);
  process.exit(1);
});
