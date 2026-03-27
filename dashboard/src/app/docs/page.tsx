"use client";

import { ServiceIframe } from "@/components/layout/service-iframe";

export default function DocsPage() {
  return <ServiceIframe port={18002} title="GasStorm Docs" syncHash />;
}
