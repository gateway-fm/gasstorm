"use client";

import Link from "next/link";
import { useChainStore } from "@/stores/chain-store";

interface ServiceLink {
  name: string;
  href: string;
  getOnline: (state: ServiceState) => boolean;
}

interface ServiceState {
  l2Online: boolean;
  explorerOnline: boolean;
  l1Online: boolean;
  privacyOnline: boolean;
}

const SERVICE_LINKS: ServiceLink[] = [
  { name: "L1 Block Explorer", href: "/explorer-l1", getOnline: (s) => s.l1Online },
  { name: "L2 Block Explorer", href: "/explorer-l2", getOnline: (s) => s.explorerOnline },
  { name: "Bridge UI", href: "/bridge-ui", getOnline: (s) => s.l2Online },
  { name: "Privacy Dashboard", href: "/privacy", getOnline: (s) => s.privacyOnline },
];

function StatusDot({ online }: { online: boolean }) {
  if (online) {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
      </span>
    );
  }
  return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />;
}

export function ServiceLinks() {
  const { l1, l2, explorer, privacyProxy } = useChainStore();

  const state: ServiceState = {
    l2Online: l2.isOnline,
    explorerOnline: explorer.isOnline,
    l1Online: l1.isOnline,
    privacyOnline: privacyProxy.isOnline,
  };

  return (
    <div className="flex items-center gap-4 mb-4">
      {SERVICE_LINKS.map((link) => {
        const online = link.getOnline(state);
        return (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-2 text-sm text-blue-400 hover:underline"
          >
            <StatusDot online={online} />
            {link.name}
          </Link>
        );
      })}
    </div>
  );
}
