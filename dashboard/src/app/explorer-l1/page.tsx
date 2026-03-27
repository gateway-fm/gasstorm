"use client";

import { ServiceIframe } from "@/components/layout/service-iframe";

export default function ExplorerL1Page() {
  return <ServiceIframe port={18203} title="L1 Block Explorer" syncHash />;
}
