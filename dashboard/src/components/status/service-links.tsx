"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useChainStore } from "@/stores/chain-store";
import { useWebSocketContext } from "@/contexts/websocket-context";

interface EndpointEntry {
  name: string;
  url: string;
  tag: "API" | "Admin";
  getStatus: (state: ServiceState) => boolean;
}

interface ServiceState {
  l1Online: boolean;
  l2Online: boolean;
  builderOnline: boolean;
  loadGenConnected: boolean;
  explorerOnline: boolean;
  privacyOnline: boolean;
  blobDAOnline: boolean;
}

const ENDPOINTS: EndpointEntry[] = [
  { name: "L1 RPC", url: "http://localhost:18545", tag: "API", getStatus: (s) => s.l1Online },
  { name: "L2 RPC", url: "http://localhost:18546", tag: "API", getStatus: (s) => s.l2Online },
  { name: "Block Builder RPC", url: "http://localhost:13000", tag: "API", getStatus: (s) => s.builderOnline },
  { name: "Load Generator API", url: "http://localhost:13001", tag: "API", getStatus: (s) => s.loadGenConnected },
  { name: "Blob DA API", url: "http://localhost:18125", tag: "API", getStatus: (s) => s.blobDAOnline },
  { name: "L2 Explorer API", url: "http://localhost:18200", tag: "API", getStatus: (s) => s.explorerOnline },
  { name: "L1 Explorer API", url: "http://localhost:18202", tag: "API", getStatus: (s) => s.l1Online },
  { name: "Privacy API", url: "http://localhost:18300", tag: "API", getStatus: (s) => s.privacyOnline },
  {
    name: "Privacy Admin Dashboard",
    url: "http://localhost:18301/admin/dashboard",
    tag: "Admin",
    getStatus: (s) => s.privacyOnline,
  },
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
  const { l1, l2, builder, explorer, privacyProxy, blobDA } = useChainStore();
  const { loadGenConnected } = useWebSocketContext();

  const state: ServiceState = {
    l1Online: l1.isOnline,
    l2Online: l2.isOnline,
    builderOnline: builder.isOnline,
    loadGenConnected,
    explorerOnline: explorer.isOnline,
    privacyOnline: privacyProxy.isOnline,
    blobDAOnline: blobDA.isOnline,
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Service Endpoints</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2">
          {ENDPOINTS.map((endpoint) => {
            const online = endpoint.getStatus(state);
            return (
              <div key={endpoint.url} className="flex items-center gap-2 min-w-0">
                <StatusDot online={online} />
                <a
                  href={endpoint.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-mono truncate text-blue-400 hover:underline"
                  title={`${endpoint.name} — ${endpoint.url}`}
                >
                  {endpoint.name}
                  <span className="text-muted-foreground ml-1">{endpoint.tag}</span>
                </a>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
