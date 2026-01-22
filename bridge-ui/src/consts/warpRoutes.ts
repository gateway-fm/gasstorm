import { TokenStandard, WarpCoreConfig } from '@hyperlane-xyz/sdk';

// Warp Route configuration for Sequencer PoC local chains
// L1 (Anvil) <-> L2 (op-reth) native ETH bridging
// Addresses are deterministic based on deployer nonce

const L1_WARP_ROUTE = '0x712516e61c8b383df4a63cfe83d7701bce54b03e';
const L2_WARP_ROUTE = '0x712516e61c8b383df4a63cfe83d7701bce54b03e';

export const warpRouteConfigs: WarpCoreConfig = {
  tokens: [
    {
      chainName: 'l1local',
      standard: TokenStandard.EvmHypNative,
      addressOrDenom: L1_WARP_ROUTE,
      decimals: 18,
      symbol: 'ETH',
      name: 'Ether',
      logoURI: '/logos/ethereum.svg',
      connections: [
        {
          token: `ethereum|l2local|${L2_WARP_ROUTE}`,
        },
      ],
    },
    {
      chainName: 'l2local',
      standard: TokenStandard.EvmHypNative,
      addressOrDenom: L2_WARP_ROUTE,
      decimals: 18,
      symbol: 'ETH',
      name: 'Ether',
      logoURI: '/logos/ethereum.svg',
      connections: [
        {
          token: `ethereum|l1local|${L1_WARP_ROUTE}`,
        },
      ],
    },
  ],
  options: {},
};
