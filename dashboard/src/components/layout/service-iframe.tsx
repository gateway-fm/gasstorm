"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { getServiceUrl } from "@/lib/host";

interface ServiceIframeProps {
  port: number;
  path?: string;
  title: string;
  /** Mirror the iframe's subpath under the parent's pathname (e.g. /explorer-l2/block/123).
   *  Requires the iframed app to post `gasstorm-iframe-route` messages (injected via
   *  nginx sub_filter for the explorer; see config/explorer-nginx.conf). */
  syncHash?: boolean;
  /** Direct URL override — bypasses /proxy/ path prefix for SPAs that can't handle it */
  directUrl?: string;
}

// The dashboard route this iframe is mounted under (e.g. "/explorer-l2"). First path segment.
function getRoutePrefix(): string {
  if (typeof window === "undefined") return "";
  const m = window.location.pathname.match(/^\/[^/]+/);
  return m ? m[0] : "";
}

export function ServiceIframe({ port, path = "", title, syncHash, directUrl }: ServiceIframeProps) {
  const ref = useRef<HTMLIFrameElement>(null);

  // Recover the iframe's initial subpath from the parent URL so refresh/deep links land
  // on the right page inside the iframe.
  const [initialSubpath] = useState(() => {
    if (!syncHash || typeof window === "undefined") return "";
    const prefix = getRoutePrefix();
    const rest = window.location.pathname.slice(prefix.length) + window.location.search;
    if (rest === "" || rest === "/") return "";
    return rest;
  });

  const effectivePath = initialSubpath || path;

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
    [port, effectivePath, directUrl],
  );

  // Listen for route messages posted by the iframe and mirror them in the parent URL.
  useEffect(() => {
    if (!syncHash) return;
    const iframe = ref.current;

    const stripCacheBuster = (sub: string): string => {
      try {
        const u = new URL(sub, "http://x");
        u.searchParams.delete("_v");
        const q = u.searchParams.toString();
        return u.pathname + (q ? "?" + q : "") + u.hash;
      } catch {
        return sub;
      }
    };

    const onMessage = (ev: MessageEvent) => {
      if (iframe && ev.source !== iframe.contentWindow) return;
      const data = ev.data as { type?: string; path?: string } | null;
      if (!data || data.type !== "gasstorm-iframe-route") return;
      const sub = stripCacheBuster(typeof data.path === "string" ? data.path : "/");
      const routePrefix = getRoutePrefix();
      const newPath = routePrefix + (sub === "/" ? "" : sub);
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (newPath !== current) {
        window.history.replaceState(null, "", newPath || "/");
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
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
