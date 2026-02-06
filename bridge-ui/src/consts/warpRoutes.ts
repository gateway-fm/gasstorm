import { TokenStandard, WarpCoreConfig } from '@hyperlane-xyz/sdk';

// Warp Route configuration for GasStorm local chains
// L1 (Anvil) <-> L2 (op-reth) native ETH bridging
//
// NOTE: These are DEFAULT addresses used as fallback when dynamic loading fails.
// In production, addresses are loaded dynamically from /api/hyperlane/addresses.json
// because hyperlane-init deploys fresh contracts on each stack start.

// Default addresses - these are fallbacks, not guaranteed to be deployed
const DEFAULT_L1_WARP_ROUTE = '0x712516e61c8b383df4a63cfe83d7701bce54b03e';
const DEFAULT_L2_WARP_ROUTE = '0x712516e61c8b383df4a63cfe83d7701bce54b03e';

/**
 * Build warp route configuration with specific addresses.
 * Used by warpCoreConfig.ts after loading dynamic addresses.
 */
export function buildWarpRouteConfig(
  l1WarpRoute: string,
  l2WarpRoute: string,
): WarpCoreConfig {
  return {
    tokens: [
      {
        chainName: 'l1local',
        standard: TokenStandard.EvmHypNative,
        addressOrDenom: l1WarpRoute,
        decimals: 18,
        symbol: 'ETH',
        name: 'Ether',
        logoURI: '/logos/ethereum.svg',
        connections: [
          {
            token: `ethereum|l2local|${l2WarpRoute}`,
          },
        ],
      },
      {
        chainName: 'l2local',
        standard: TokenStandard.EvmHypNative,
        addressOrDenom: l2WarpRoute,
        decimals: 18,
        symbol: 'ETH',
        name: 'Ether',
        logoURI: '/logos/ethereum.svg',
        connections: [
          {
            token: `ethereum|l1local|${l1WarpRoute}`,
          },
        ],
      },
    ],
    options: {},
  };
}

/**
 * Static warp route config with default addresses.
 * This is used as a fallback when dynamic address loading fails.
 *
 * @deprecated Prefer using buildWarpRouteConfig with dynamic addresses
 */
export const warpRouteConfigs: WarpCoreConfig = buildWarpRouteConfig(
  DEFAULT_L1_WARP_ROUTE,
  DEFAULT_L2_WARP_ROUTE,
);

// Export default addresses for reference
export const DEFAULT_WARP_ADDRESSES = {
  l1: DEFAULT_L1_WARP_ROUTE,
  l2: DEFAULT_L2_WARP_ROUTE,
} as const;
