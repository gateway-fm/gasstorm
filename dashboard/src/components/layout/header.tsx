"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useWebSocketContext } from "@/contexts/websocket-context";

interface NavItem {
  label: string;
  href: string;
  match: (pathname: string) => boolean;
}

function matchExact(href: string) {
  return (p: string) => p === href || p === `${href}/`;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", match: (p) => p === "/" || p === "" },
  { label: "Load Test", href: "/load-test", match: matchExact("/load-test") },
  { label: "History", href: "/load-test/history", match: (p) => p.startsWith("/load-test/history") },
  { label: "Bridge", href: "/bridge", match: matchExact("/bridge") },
];

const SERVICE_ITEMS: NavItem[] = [
  { label: "L1 Explorer", href: "/explorer-l1", match: matchExact("/explorer-l1") },
  { label: "L2 Explorer", href: "/explorer-l2", match: matchExact("/explorer-l2") },
  { label: "Blob DA", href: "/blob-da", match: matchExact("/blob-da") },
  { label: "Bridge UI", href: "/bridge-ui", match: matchExact("/bridge-ui") },
  { label: "Privacy", href: "/privacy", match: matchExact("/privacy") },
  { label: "Docs", href: "/docs", match: matchExact("/docs") },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "px-3 py-1.5 text-sm font-mono font-medium rounded-md transition-all duration-150 whitespace-nowrap",
        item.match(pathname)
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-accent"
      )}
    >
      {item.label}
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const { l1Connected, l2Connected, loadGenConnected } = useWebSocketContext();

  return (
    <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center gap-3">
            <div className="font-mono text-xl font-bold flex items-center select-none">
              <span className="text-primary">&gt;</span>
              <span className="text-foreground animate-cursor-blink">_</span>
            </div>
            <div className="min-w-0 hidden sm:block">
              <h1 className="text-sm font-semibold font-mono truncate tracking-tight">
                GasStorm
              </h1>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
            <span className="text-muted-foreground/30 select-none">|</span>
            {SERVICE_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </nav>

          {/* Status indicators */}
          <div className="hidden sm:flex items-center gap-3 font-mono text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  l1Connected ? "bg-success animate-status-pulse" : "bg-destructive"
                )}
              />
              <span>L1</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  l2Connected ? "bg-success animate-status-pulse" : "bg-destructive"
                )}
              />
              <span>L2</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  loadGenConnected ? "bg-success animate-status-pulse" : "bg-destructive"
                )}
              />
              <span>LoadGen</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
