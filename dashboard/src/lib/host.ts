/**
 * Host utilities for constructing service URLs.
 *
 * When accessing the dashboard over Tailscale (e.g. max-mac:3000) instead of
 * localhost:3000, all browser-initiated connections (WebSockets, iframes) must
 * use the same hostname. These helpers derive the hostname from
 * window.location so everything works regardless of how you reach the dashboard.
 */

/** Current browser hostname, or "localhost" during SSR. */
export function getHostname(): string {
  if (typeof window === "undefined") return "localhost";
  return window.location.hostname;
}

/**
 * Whether we're running the Next.js dev server (port 3000).
 * In dev mode, WebSocket connections go directly to service ports
 * because Next.js rewrites don't support WebSocket upgrades.
 */
export function isDevMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.port === "3000";
}

/**
 * Whether we're running behind a single exposed port (e.g. remote/cloud deploy).
 * In this mode, service iframes use /proxy/{port}/ paths instead of direct ports.
 */
function isSinglePortMode(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.port;
  // Port 80 (or empty = default HTTP) means only one port is exposed
  return p === "" || p === "80";
}

/** Build an HTTP URL for a local service by port. */
export function getServiceUrl(port: number, path = ""): string {
  if (isSinglePortMode()) {
    return `/proxy/${port}/${path.replace(/^\//, "")}`;
  }
  return `http://${getHostname()}:${port}${path}`;
}

/** Build a WS URL for a local service by port. */
export function getServiceWsUrl(port: number, path = ""): string {
  return `ws://${getHostname()}:${port}${path}`;
}
