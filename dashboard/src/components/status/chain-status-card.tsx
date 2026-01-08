"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatGwei } from "@/lib/statistics";

interface ChainStatusCardProps {
  title: string;
  subtitle: string;
  endpoint: string;
  isOnline: boolean;
  blockNumber: number;
  chainId: number;
  gasPrice?: bigint;
  additionalInfo?: React.ReactNode;
}

export function ChainStatusCard({
  title,
  subtitle,
  endpoint,
  isOnline,
  blockNumber,
  chainId,
  gasPrice,
  additionalInfo,
}: ChainStatusCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Badge variant={isOnline ? "default" : "destructive"} className={isOnline ? "bg-green-600 hover:bg-green-600" : ""}>
          {isOnline ? "Online" : "Offline"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Endpoint</span>
          <a
            href={`http://${endpoint}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline font-mono"
          >
            {endpoint}
          </a>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Block Number</span>
          <span className="font-mono" suppressHydrationWarning>{blockNumber > 0 ? blockNumber.toLocaleString() : "-"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Chain ID</span>
          <span className="font-mono">{chainId > 0 ? chainId : "-"}</span>
        </div>
        {gasPrice !== undefined && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Gas Price</span>
            <span className="font-mono">{gasPrice > 0n ? formatGwei(gasPrice) : "-"}</span>
          </div>
        )}
        {additionalInfo}
      </CardContent>
    </Card>
  );
}
