"use client";

import { ServiceIframe } from "@/components/layout/service-iframe";

// Unified block explorer tab. The iframe loads the L2 explorer by default; users
// switch to L1 via the network dropdown in the explorer's own nav bar (which
// reads /featured-networks.json — see config/featured-networks.json).
export default function ExplorerPage() {
  return <ServiceIframe key={18201} port={18201} title="Block Explorer" syncHash />;
}
