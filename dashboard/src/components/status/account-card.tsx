"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TEST_ACCOUNT } from "@/types/chain";
import { formatEth } from "@/lib/statistics";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AccountCardProps {
  l1Balance: bigint;
  l2Balance: bigint;
  compact?: boolean;
}

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied to clipboard`);
}

export function AccountCard({ l1Balance, l2Balance, compact = false }: AccountCardProps) {
  if (compact) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm font-medium">Test Account</CardTitle>
        </CardHeader>
        <CardContent className="pb-3 pt-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-muted-foreground shrink-0">Addr:</span>
              <code className="font-mono truncate">{TEST_ACCOUNT.address.slice(0, 10)}...</code>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] shrink-0"
                onClick={() => copyToClipboard(TEST_ACCOUNT.address, "Address")}
              >
                Copy
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">L1:</span>
                <span className="font-mono tabular-nums">{l1Balance > 0n ? formatEth(l1Balance) : "-"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">L2:</span>
                <span className="font-mono tabular-nums">{l2Balance > 0n ? formatEth(l2Balance) : "-"}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Test Account (Anvil Default)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Address</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs truncate max-w-[200px]">
              {TEST_ACCOUNT.address}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => copyToClipboard(TEST_ACCOUNT.address, "Address")}
            >
              Copy
            </Button>
          </div>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Private Key</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs truncate max-w-[200px]">
              {TEST_ACCOUNT.privateKey.slice(0, 18)}...
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => copyToClipboard(TEST_ACCOUNT.privateKey, "Private Key")}
            >
              Copy
            </Button>
          </div>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">L1 Balance</span>
          <span className="font-mono">{l1Balance > 0n ? formatEth(l1Balance) : "-"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">L2 Balance</span>
          <span className="font-mono">{l2Balance > 0n ? formatEth(l2Balance) : "-"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
