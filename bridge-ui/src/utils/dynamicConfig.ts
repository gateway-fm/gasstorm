/**
 * Dynamic configuration loader for Hyperlane addresses.
 *
 * Loads warp route addresses from the deployment output.
 * The addresses are served by a Next.js API route that reads
 * from the mounted hyperlane-config volume.
 */

import { logger } from './logger';

export interface DynamicAddresses {
  l1: {
    domainId: number;
    mailbox: string;
    warpRoute?: string;
  };
  l2: {
    domainId: number;
    mailbox: string;
    warpRoute?: string;
  };
}

export interface DynamicAddressResult {
  l1WarpRoute: string | null;
  l2WarpRoute: string | null;
  l1DomainId: number;
  l2DomainId: number;
  loadedFromDynamic: boolean;
}

const DEFAULT_L1_DOMAIN_ID = 31337;
const DEFAULT_L2_DOMAIN_ID = 42069;

let cachedResult: DynamicAddressResult | null = null;

function isValidAddress(addr: string | undefined): boolean {
  return !!addr && addr.length === 42 && addr.startsWith('0x');
}

export async function loadDynamicAddresses(): Promise<DynamicAddressResult> {
  if (cachedResult) return cachedResult;

  try {
    const res = await fetch('/api/hyperlane/addresses.json');
    if (res.ok) {
      const data: DynamicAddresses = await res.json();
      logger.debug('Loaded dynamic addresses:', data);

      cachedResult = {
        l1WarpRoute: isValidAddress(data.l1?.warpRoute) ? data.l1.warpRoute! : null,
        l2WarpRoute: isValidAddress(data.l2?.warpRoute) ? data.l2.warpRoute! : null,
        l1DomainId: data.l1?.domainId || DEFAULT_L1_DOMAIN_ID,
        l2DomainId: data.l2?.domainId || DEFAULT_L2_DOMAIN_ID,
        loadedFromDynamic: true,
      };
      return cachedResult;
    }
  } catch (error) {
    logger.debug('Failed to load dynamic addresses:', error);
  }

  // Fallback - no dynamic addresses available
  cachedResult = {
    l1WarpRoute: null,
    l2WarpRoute: null,
    l1DomainId: DEFAULT_L1_DOMAIN_ID,
    l2DomainId: DEFAULT_L2_DOMAIN_ID,
    loadedFromDynamic: false,
  };
  return cachedResult;
}

export function clearDynamicAddressCache(): void {
  cachedResult = null;
}
