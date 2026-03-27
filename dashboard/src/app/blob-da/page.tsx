"use client";

import { ServiceIframe } from "@/components/layout/service-iframe";

export default function BlobDAPage() {
  return <ServiceIframe port={18126} title="Blob DA" syncHash />;
}
