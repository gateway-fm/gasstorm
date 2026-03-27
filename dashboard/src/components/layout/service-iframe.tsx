"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { getServiceUrl } from "@/lib/host";

interface ServiceIframeProps {
  port: number;
  path?: string;
  title: string;
  /** Persist the iframe's subpath in the URL hash across refreshes */
  syncHash?: boolean;
}

export function ServiceIframe({ port, path = "", title, syncHash }: ServiceIframeProps) {
  const ref = useRef<HTMLIFrameElement>(null);

  // On mount, restore subpath from URL hash (e.g. #/block/123?tab=txs)
  const [hashPath] = useState(() => {
    if (!syncHash || typeof window === "undefined") return "";
    const h = window.location.hash;
    if (!h || h === "#" || h === "#/") return "";
    return h.slice(1); // strip leading #
  });

  const effectivePath = hashPath || path;

  const setRef = useCallback(
    (el: HTMLIFrameElement | null) => {
      if (el) {
        // Cache buster prevents stale JS bundles from being served after image rebuilds
        const sep = effectivePath.includes("?") ? "&" : "?";
        el.src = getServiceUrl(port, effectivePath) + sep + "_v=" + Date.now();
      }
      (ref as React.MutableRefObject<HTMLIFrameElement | null>).current = el;
    },
    [port, effectivePath],
  );

  // Sync iframe URL back to parent hash on navigation (best-effort, cross-origin may block)
  useEffect(() => {
    if (!syncHash) return;
    const iframe = ref.current;
    if (!iframe) return;

    const syncUrl = () => {
      try {
        const loc = iframe.contentWindow?.location;
        if (!loc) return;
        const iframePath = (loc.pathname ?? "") + (loc.search ?? "") + (loc.hash ?? "");
        if (iframePath === "/" || iframePath === "") {
          if (window.location.hash) {
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }
        } else {
          const newHash = `#${iframePath}`;
          if (newHash !== window.location.hash) {
            window.history.replaceState(null, "", window.location.pathname + window.location.search + newHash);
          }
        }
      } catch {
        // Cross-origin — can't read iframe URL, skip sync
      }
    };

    iframe.addEventListener("load", syncUrl);
    return () => iframe.removeEventListener("load", syncUrl);
  }, [syncHash]);

  return (
    <iframe
      ref={setRef}
      title={title}
      className="w-full h-[calc(100vh-7rem)] border-0"
      allow="clipboard-read; clipboard-write"
    />
  );
}
