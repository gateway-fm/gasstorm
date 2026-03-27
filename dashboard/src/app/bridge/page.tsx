"use client";

import { ServiceIframe } from "@/components/layout/service-iframe";

export default function BridgePage() {
  return <ServiceIframe port={18001} title="Hyperlane Bridge" syncHash />;
}
