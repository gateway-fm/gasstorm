"use client";

import { ServiceIframe } from "@/components/layout/service-iframe";

// Direct URL to the bridge UI — bypasses /proxy/ path prefix.
// Set NEXT_PUBLIC_BRIDGE_UI_URL at build time for remote deploys.
const bridgeUiUrl = process.env.NEXT_PUBLIC_BRIDGE_UI_URL || "";

export default function BridgePage() {
  return <ServiceIframe port={18001} title="Hyperlane Bridge" directUrl={bridgeUiUrl} />;
}
