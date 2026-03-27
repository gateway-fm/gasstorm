"use client";

import { useChainData } from "@/hooks/use-rpc";

export function ChainDataPoller() {
  useChainData();
  return null;
}
