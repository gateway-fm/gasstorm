"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { getServiceUrl } from "@/lib/host";

interface ServiceIframeProps {
  port: number;
  path?: string;
  title: string;
  /** Persist the iframe's subpath in the URL hash across refreshes */
  syncHash?: boolean;
  /** Direct URL override — bypasses /proxy/ path prefix for SPAs that can't handle it */
  directUrl?: string;
}

export function ServiceIframe({ port, path = "", title, syncHash, directUrl }: ServiceIframeProps) {
  const ref = useRef<HTMLIFrameElement>(null);

  // On mount, restore subpath from URL hash (e.g. #/block/123?tab=txs)
  // Ignore the hash if it belongs to a different service port (stale from previous page)
  const [hashPath] = useState(() => {
    if (!syncHash || typeof window === "undefined") return "";
    const h = window.location.hash;
    if (!h || h === "#" || h === "#/") return "";
    const decoded = h.slice(1); // strip leading #
    // In single-port mode, hash contains /proxy/{port}/... — ignore if port doesn't match
    if (decoded.startsWith("/proxy/") && !decoded.startsWith(`/proxy/${port}/`)) return "";
    return decoded;
  });

  const effectivePath = hashPath || path;

  const setRef = useCallback(
    (el: HTMLIFrameElement | null) => {
      if (el) {
        // Cache buster prevents stale JS bundles from being served after image rebuilds
        const sep = effectivePath.includes("?") ? "&" : "?";
        const base = directUrl ? `${directUrl}${effectivePath}` : getServiceUrl(port, effectivePath);
        el.src = base + sep + "_v=" + Date.now();
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
