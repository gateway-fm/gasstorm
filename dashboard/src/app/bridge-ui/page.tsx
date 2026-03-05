"use client";

import { ServiceIframe } from "@/components/layout/service-iframe";

export default function BridgeUIPage() {
  return <ServiceIframe port={18001} title="Hyperlane Bridge" />;
}
