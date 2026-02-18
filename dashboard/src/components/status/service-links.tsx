"use client";

import { useChainStore } from "@/stores/chain-store";

interface ServiceLink {
  name: string;
  url: string;
  getOnline: (state: ServiceState) => boolean;
}

interface ServiceState {
  l2Online: boolean;
  explorerOnline: boolean;
  l1Online: boolean;
  privacyOnline: boolean;
}

const SERVICE_LINKS: ServiceLink[] = [
  { name: "L2 Block Explorer", url: "http://localhost:18201", getOnline: (s) => s.explorerOnline },
  { name: "L1 Block Explorer", url: "http://localhost:18203", getOnline: (s) => s.l1Online },
  { name: "Privacy Dashboard", url: "http://localhost:18301/admin/dashboard", getOnline: (s) => s.privacyOnline },
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
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-blue-400 hover:underline"
            title={link.url}
          >
            <StatusDot online={online} />
            {link.name}
          </a>
        );
      })}
    </div>
  );
}
