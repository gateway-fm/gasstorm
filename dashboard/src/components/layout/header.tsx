"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface HeaderProps {
  l1WsConnected?: boolean;
  l2WsConnected?: boolean;
  loadGenWsConnected?: boolean;
}

export function Header({ l1WsConnected, l2WsConnected, loadGenWsConnected }: HeaderProps) {
  const pathname = usePathname();

  return (
    <header className="border-b">
      <div className="container mx-auto px-4 py-3 md:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Logo, Title, and Nav */}
          <div className="flex items-center justify-between sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600" />
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-semibold truncate">R&D Test Rig</h1>
                <p className="text-xs text-muted-foreground truncate hidden sm:block">
                  Reth Sequencer PoC | Engine API Block Builder
                </p>
              </div>
            </div>

            {/* Nav links - shown inline on mobile */}
            <nav className="flex items-center gap-1 sm:ml-6">
              <Link
                href="/"
                className={cn(
                  "px-2 sm:px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  pathname === "/" || pathname === ""
                    ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                Dashboard
              </Link>
              <Link
                href="/load-test"
                className={cn(
                  "px-2 sm:px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                  pathname.startsWith("/load-test")
                    ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                Load Test
              </Link>
            </nav>

            {/* WS indicators - shown on same row on mobile */}
            <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground sm:hidden">
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    l1WsConnected ? "bg-green-500" : "bg-red-500"
                  )}
                />
                <span>L1</span>
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    l2WsConnected ? "bg-green-500" : "bg-red-500"
                  )}
                />
                <span>L2</span>
              </div>
              {loadGenWsConnected !== undefined && (
                <div className="flex items-center gap-1">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      loadGenWsConnected ? "bg-green-500" : "bg-red-500"
                    )}
                  />
                  <span>LG</span>
                </div>
              )}
            </div>
          </div>

          {/* WS indicators - desktop only (full text) */}
          <div className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  l1WsConnected ? "bg-green-500" : "bg-red-500"
                )}
              />
              <span>L1 WS</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  l2WsConnected ? "bg-green-500" : "bg-red-500"
                )}
              />
              <span>L2 WS</span>
            </div>
            {loadGenWsConnected !== undefined && (
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    loadGenWsConnected ? "bg-green-500" : "bg-red-500"
                  )}
                />
                <span>LoadGen WS</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
