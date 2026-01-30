"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useWebSocketContext } from "@/contexts/websocket-context";

export function Header() {
  const pathname = usePathname();
  const { l1Connected, l2Connected, loadGenConnected } = useWebSocketContext();

  const l1WsConnected = l1Connected;
  const l2WsConnected = l2Connected;
  const loadGenWsConnected = loadGenConnected;

  return (
    <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center gap-3">
            {/* Terminal prompt logo */}
            <div className="font-mono text-xl font-bold flex items-center select-none">
              <span className="text-primary">&gt;</span>
              <span className="text-foreground animate-cursor-blink">_</span>
            </div>
            <div className="min-w-0 hidden sm:block">
              <h1 className="text-sm font-semibold font-mono truncate tracking-tight">
                GasStorm
              </h1>
              <p className="text-xs text-muted-foreground font-mono truncate">
                Blockchain stress testing rig
              </p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className={cn(
                "px-3 py-1.5 text-sm font-mono font-medium rounded-md transition-all duration-150",
                pathname === "/" || pathname === ""
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              Dashboard
            </Link>
            <Link
              href="/load-test"
              className={cn(
                "px-3 py-1.5 text-sm font-mono font-medium rounded-md transition-all duration-150 whitespace-nowrap",
                pathname === "/load-test" || pathname === "/load-test/"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              Load Test
            </Link>
            <Link
              href="/load-test/history"
              className={cn(
                "px-3 py-1.5 text-sm font-mono font-medium rounded-md transition-all duration-150",
                pathname.startsWith("/load-test/history")
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              History
            </Link>
            <Link
              href="/bridge"
              className={cn(
                "px-3 py-1.5 text-sm font-mono font-medium rounded-md transition-all duration-150",
                pathname === "/bridge" || pathname === "/bridge/"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              Bridge
            </Link>
          </nav>

          {/* Status indicators */}
          <div className="hidden sm:flex items-center gap-3 font-mono text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  l1WsConnected ? "bg-success animate-status-pulse" : "bg-destructive"
                )}
              />
              <span>L1</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  l2WsConnected ? "bg-success animate-status-pulse" : "bg-destructive"
                )}
              />
              <span>L2</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  loadGenWsConnected ? "bg-success animate-status-pulse" : "bg-destructive"
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
