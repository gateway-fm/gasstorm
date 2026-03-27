"use client";

import { ServiceIframe } from "@/components/layout/service-iframe";

export default function ExplorerL2Page() {
  return <ServiceIframe port={18201} title="L2 Block Explorer" syncHash />;
}
