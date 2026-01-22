"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { l1, l2 } from "@/lib/rpc-client";
import { RPC_ENDPOINTS, HYPERLANE_CONTRACTS, BRIDGE_ACCOUNT, WARP_ROUTE_ABI } from "@/types/chain";

// Dynamic addresses loaded from deployment
interface HyperlaneAddresses {
  l1: {
    domainId: number;
    mailbox: string;
    warpRoute?: string;
  };
  l2: {
    domainId: number;
    mailbox: string;
    warpRoute?: string;
  };
}

interface BridgeTransaction {
  id: string;
  direction: "deposit" | "withdraw";
  amount: string;
  status: "pending" | "relaying" | "completed" | "failed";
  txHash: string;
  timestamp: Date;
}

// Validate that an address is not empty or zero
function isValidAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  if (addr === "0x0000000000000000000000000000000000000000") return false;
  if (addr.length < 42) return false;
  return true;
}

// ReceivedTransferRemote event signature
const RECEIVED_TRANSFER_EVENT = "0xba20947a325f450d232530e5f5fce293e7963499d5309a07cee84a269f2f15a6";

// Check if a ReceivedTransferRemote event exists for a specific recipient from a specific origin
async function checkReceivedEvent(
  provider: ethers.JsonRpcProvider,
  warpRouteAddress: string,
  originDomain: number,
  recipientAddress: string,
  fromBlock: number
): Promise<boolean> {
  try {
    // Pad recipient to bytes32 for topic matching
    const recipientPadded = ethers.zeroPadValue(recipientAddress, 32);

    // Get logs for ReceivedTransferRemote events
    const logs = await provider.getLogs({
      address: warpRouteAddress,
      topics: [
        RECEIVED_TRANSFER_EVENT,
        ethers.zeroPadValue(ethers.toBeHex(originDomain), 32), // origin domain
        recipientPadded, // recipient
      ],
      fromBlock,
    });

    return logs.length > 0;
  } catch (error) {
    console.error("Error checking received event:", error);
    return false;
  }
}

// Load dynamic addresses from deployment, fall back to hardcoded
async function loadHyperlaneAddresses(): Promise<{
  l1WarpRoute: string;
  l2WarpRoute: string;
  l1Mailbox: string;
  l2Mailbox: string;
  l1DomainId: number;
  l2DomainId: number;
  loadedFromDynamic: boolean;
  deploymentStatus: "success" | "failed" | "unknown";
}> {
  // Try multiple paths where addresses might be stored
  const paths = [
    '/api/hyperlane/addresses.json',
    '/hyperlane/addresses.json',
  ];

  for (const path of paths) {
    try {
      const response = await fetch(path);
      if (response.ok) {
        const data: HyperlaneAddresses = await response.json();
        console.log(`[Bridge] Loaded dynamic addresses from ${path}:`, data);

        // Validate the addresses are real (not zero addresses)
        const l1MailboxValid = isValidAddress(data.l1?.mailbox);
        const l2MailboxValid = isValidAddress(data.l2?.mailbox);

        if (!l1MailboxValid || !l2MailboxValid) {
          console.warn('[Bridge] Dynamic addresses contain invalid mailbox addresses, trying next source');
          continue;
        }

        return {
          l1WarpRoute: data.l1.warpRoute || HYPERLANE_CONTRACTS.L1_WARP_ROUTE,
          l2WarpRoute: data.l2.warpRoute || HYPERLANE_CONTRACTS.L2_WARP_ROUTE,
          l1Mailbox: data.l1.mailbox || HYPERLANE_CONTRACTS.L1_MAILBOX,
          l2Mailbox: data.l2.mailbox || HYPERLANE_CONTRACTS.L2_MAILBOX,
          l1DomainId: data.l1.domainId || HYPERLANE_CONTRACTS.L1_DOMAIN_ID,
          l2DomainId: data.l2.domainId || HYPERLANE_CONTRACTS.L2_DOMAIN_ID,
          loadedFromDynamic: true,
          deploymentStatus: "success",
        };
      }
    } catch (error) {
      console.log(`[Bridge] Failed to load from ${path}:`, error);
    }
  }

  // Check if there's a deployment status file indicating failure
  try {
    const statusResponse = await fetch('/api/hyperlane/deploy-status.json');
    if (statusResponse.ok) {
      const status = await statusResponse.json();
      if (status.status === "failed") {
        console.error('[Bridge] Hyperlane deployment failed:', status.error);
        return {
          l1WarpRoute: HYPERLANE_CONTRACTS.L1_WARP_ROUTE,
          l2WarpRoute: HYPERLANE_CONTRACTS.L2_WARP_ROUTE,
          l1Mailbox: HYPERLANE_CONTRACTS.L1_MAILBOX,
          l2Mailbox: HYPERLANE_CONTRACTS.L2_MAILBOX,
          l1DomainId: HYPERLANE_CONTRACTS.L1_DOMAIN_ID,
          l2DomainId: HYPERLANE_CONTRACTS.L2_DOMAIN_ID,
          loadedFromDynamic: false,
          deploymentStatus: "failed",
        };
      }
    }
  } catch {
    // Ignore - status file may not exist
  }

  console.log('[Bridge] No dynamic addresses found, using hardcoded');

  // Fall back to hardcoded addresses
  return {
    l1WarpRoute: HYPERLANE_CONTRACTS.L1_WARP_ROUTE,
    l2WarpRoute: HYPERLANE_CONTRACTS.L2_WARP_ROUTE,
    l1Mailbox: HYPERLANE_CONTRACTS.L1_MAILBOX,
    l2Mailbox: HYPERLANE_CONTRACTS.L2_MAILBOX,
    l1DomainId: HYPERLANE_CONTRACTS.L1_DOMAIN_ID,
    l2DomainId: HYPERLANE_CONTRACTS.L2_DOMAIN_ID,
    loadedFromDynamic: false,
    deploymentStatus: "unknown",
  };
}

export function BridgePanel() {
  const [l1Balance, setL1Balance] = useState<bigint>(0n);
  const [l2Balance, setL2Balance] = useState<bigint>(0n);
  const [l1WarpBalance, setL1WarpBalance] = useState<bigint>(0n);
  const [l2WarpBalance, setL2WarpBalance] = useState<bigint>(0n);
  const [depositAmount, setDepositAmount] = useState("0.1");
  const [withdrawAmount, setWithdrawAmount] = useState("0.05");
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [transactions, setTransactions] = useState<BridgeTransaction[]>([]);

  // Dynamic addresses - use explicit type to allow dynamic values
  const [addresses, setAddresses] = useState<{
    l1WarpRoute: string;
    l2WarpRoute: string;
    l1Mailbox: string;
    l2Mailbox: string;
    l1DomainId: number;
    l2DomainId: number;
  }>({
    l1WarpRoute: HYPERLANE_CONTRACTS.L1_WARP_ROUTE,
    l2WarpRoute: HYPERLANE_CONTRACTS.L2_WARP_ROUTE,
    l1Mailbox: HYPERLANE_CONTRACTS.L1_MAILBOX,
    l2Mailbox: HYPERLANE_CONTRACTS.L2_MAILBOX,
    l1DomainId: HYPERLANE_CONTRACTS.L1_DOMAIN_ID,
    l2DomainId: HYPERLANE_CONTRACTS.L2_DOMAIN_ID,
  });
  const [deploymentStatus, setDeploymentStatus] = useState<"success" | "failed" | "unknown" | "loading">("loading");
  const [loadedFromDynamic, setLoadedFromDynamic] = useState(false);

  // Load addresses on mount
  useEffect(() => {
    loadHyperlaneAddresses().then((loaded) => {
      setAddresses({
        l1WarpRoute: loaded.l1WarpRoute,
        l2WarpRoute: loaded.l2WarpRoute,
        l1Mailbox: loaded.l1Mailbox,
        l2Mailbox: loaded.l2Mailbox,
        l1DomainId: loaded.l1DomainId,
        l2DomainId: loaded.l2DomainId,
      });
      setDeploymentStatus(loaded.deploymentStatus);
      setLoadedFromDynamic(loaded.loadedFromDynamic);

      if (loaded.deploymentStatus === "failed") {
        toast.error("Hyperlane deployment failed - bridge may not work");
      }
      // Don't warn about hardcoded addresses - they're the expected deployment addresses
      // and the warning is confusing when bridge profile isn't running
    });
  }, []);

  const fetchBalances = useCallback(async () => {
    try {
      const [l1Bal, l2Bal, l1Warp, l2Warp] = await Promise.all([
        l1.getBalance(BRIDGE_ACCOUNT.address),
        l2.getBalance(BRIDGE_ACCOUNT.address),
        l1.getBalance(addresses.l1WarpRoute),
        l2.getBalance(addresses.l2WarpRoute),
      ]);
      setL1Balance(l1Bal);
      setL2Balance(l2Bal);
      setL1WarpBalance(l1Warp);
      setL2WarpBalance(l2Warp);
    } catch {
      // Silent fail for balance fetches
    }
  }, [addresses]);

  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 5000);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  const formatEth = (wei: bigint): string => {
    return parseFloat(ethers.formatEther(wei)).toFixed(4);
  };

  // Helper to get full RPC URL (ethers needs absolute URL with protocol)
  const getFullRpcUrl = (path: string) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${path}`;
    }
    return path;
  };

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsDepositing(true);
    const txId = Date.now().toString();

    try {
      // Create provider and wallet (need full URL for ethers)
      const provider = new ethers.JsonRpcProvider(getFullRpcUrl(RPC_ENDPOINTS.L1_RPC));
      const wallet = new ethers.Wallet(BRIDGE_ACCOUNT.privateKey, provider);

      // Create contract interface
      const warpRoute = new ethers.Contract(
        addresses.l1WarpRoute,
        WARP_ROUTE_ABI,
        wallet
      );

      // Pad recipient address to bytes32
      const recipientPadded = ethers.zeroPadValue(BRIDGE_ACCOUNT.address, 32);
      const amount = ethers.parseEther(depositAmount);

      // Add pending transaction
      setTransactions(prev => [{
        id: txId,
        direction: "deposit",
        amount: depositAmount,
        status: "pending",
        txHash: "",
        timestamp: new Date(),
      }, ...prev]);

      toast.info(`Sending ${depositAmount} ETH from L1 to L2...`);

      // Capture L2 block BEFORE sending (relayer might deliver while L1 tx confirms)
      const l2Provider = new ethers.JsonRpcProvider(getFullRpcUrl(RPC_ENDPOINTS.BUILDER_RPC));
      const startBlock = Math.max(0, await l2Provider.getBlockNumber() - 5);

      // Send transaction
      const tx = await warpRoute.transferRemote(
        addresses.l2DomainId,
        recipientPadded,
        amount,
        { value: amount }
      );

      // Update with tx hash
      setTransactions(prev => prev.map(t =>
        t.id === txId ? { ...t, txHash: tx.hash, status: "relaying" } : t
      ));

      toast.info(`Transaction sent: ${tx.hash.slice(0, 10)}...`);

      // Wait for confirmation
      await tx.wait();

      toast.success(`L1 transaction confirmed! Waiting for relayer...`);

      // Poll for ReceivedTransferRemote event on L2 (more reliable than balance checking)
      let attempts = 0;
      const maxAttempts = 120; // 120 seconds (2 minutes) - event-based should be faster

      toast.info("Waiting for relayer delivery...");

      const checkDelivery = setInterval(async () => {
        attempts++;

        // Check for ReceivedTransferRemote event from L1 (domain 31337)
        const delivered = await checkReceivedEvent(
          l2Provider,
          addresses.l2WarpRoute,
          addresses.l1DomainId,
          BRIDGE_ACCOUNT.address,
          startBlock
        );

        if (delivered) {
          clearInterval(checkDelivery);
          setTransactions(prev => prev.map(t =>
            t.id === txId ? { ...t, status: "completed" } : t
          ));
          toast.success(`Deposit completed! ${depositAmount} ETH arrived on L2`);
          fetchBalances();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkDelivery);
          // Still mark as relaying - it might complete later
          toast.warning("Delivery taking longer than expected. Transaction may still complete.");
        } else if (attempts % 20 === 0) {
          // Update progress every 20 seconds
          toast.info(`Waiting for relayer... (${attempts}s)`);
        }
      }, 1000);

    } catch (error) {
      console.error("Deposit error:", error);
      setTransactions(prev => prev.map(t =>
        t.id === txId ? { ...t, status: "failed" } : t
      ));
      toast.error(`Deposit failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsDepositing(false);
      fetchBalances();
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsWithdrawing(true);
    const txId = Date.now().toString();

    try {
      // Create provider and wallet (use builder RPC for L2 tx submission, need full URL)
      const provider = new ethers.JsonRpcProvider(getFullRpcUrl(RPC_ENDPOINTS.BUILDER_RPC));
      const wallet = new ethers.Wallet(BRIDGE_ACCOUNT.privateKey, provider);

      // Create contract interface
      const warpRoute = new ethers.Contract(
        addresses.l2WarpRoute,
        WARP_ROUTE_ABI,
        wallet
      );

      // Pad recipient address to bytes32
      const recipientPadded = ethers.zeroPadValue(BRIDGE_ACCOUNT.address, 32);
      const amount = ethers.parseEther(withdrawAmount);

      // Add pending transaction
      setTransactions(prev => [{
        id: txId,
        direction: "withdraw",
        amount: withdrawAmount,
        status: "pending",
        txHash: "",
        timestamp: new Date(),
      }, ...prev]);

      toast.info(`Sending ${withdrawAmount} ETH from L2 to L1...`);

      // Capture L1 block BEFORE sending (relayer might deliver while L2 tx confirms)
      const l1Provider = new ethers.JsonRpcProvider(getFullRpcUrl(RPC_ENDPOINTS.L1_RPC));
      const startBlock = Math.max(0, await l1Provider.getBlockNumber() - 5);

      // Send transaction
      const tx = await warpRoute.transferRemote(
        addresses.l1DomainId,
        recipientPadded,
        amount,
        { value: amount }
      );

      // Update with tx hash
      setTransactions(prev => prev.map(t =>
        t.id === txId ? { ...t, txHash: tx.hash, status: "relaying" } : t
      ));

      toast.info(`Transaction sent: ${tx.hash.slice(0, 10)}...`);

      // Wait for confirmation
      await tx.wait();

      toast.success(`L2 transaction confirmed! Waiting for relayer...`);

      // Poll for ReceivedTransferRemote event on L1 (more reliable than balance checking)
      let attempts = 0;
      const maxAttempts = 120; // 120 seconds (2 minutes) - event-based should be faster

      toast.info("Waiting for relayer delivery...");

      const checkDelivery = setInterval(async () => {
        attempts++;

        // Check for ReceivedTransferRemote event from L2 (domain 42069)
        const delivered = await checkReceivedEvent(
          l1Provider,
          addresses.l1WarpRoute,
          addresses.l2DomainId,
          BRIDGE_ACCOUNT.address,
          startBlock
        );

        if (delivered) {
          clearInterval(checkDelivery);
          setTransactions(prev => prev.map(t =>
            t.id === txId ? { ...t, status: "completed" } : t
          ));
          toast.success(`Withdrawal completed! ${withdrawAmount} ETH arrived on L1`);
          fetchBalances();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkDelivery);
          // Still mark as relaying - it might complete later
          toast.warning("Delivery taking longer than expected. Transaction may still complete.");
        } else if (attempts % 20 === 0) {
          // Update progress every 20 seconds
          toast.info(`Waiting for relayer... (${attempts}s)`);
        }
      }, 1000);

    } catch (error) {
      console.error("Withdraw error:", error);
      setTransactions(prev => prev.map(t =>
        t.id === txId ? { ...t, status: "failed" } : t
      ));
      toast.error(`Withdrawal failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsWithdrawing(false);
      fetchBalances();
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Balances Card */}
      <Card>
        <CardHeader>
          <CardTitle>Balances</CardTitle>
          <CardDescription>Account: {BRIDGE_ACCOUNT.address}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">L1 (Anvil)</Label>
              <div className="text-2xl font-bold">{formatEth(l1Balance)} ETH</div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">L2 (op-reth)</Label>
              <div className="text-2xl font-bold">{formatEth(l2Balance)} ETH</div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">Warp Route Collateral</Label>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">L1 Warp: </span>
                <span className="font-mono">{formatEth(l1WarpBalance)} ETH</span>
              </div>
              <div>
                <span className="text-muted-foreground">L2 Warp: </span>
                <span className="font-mono">{formatEth(l2WarpBalance)} ETH</span>
              </div>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={fetchBalances} className="w-full">
            Refresh Balances
          </Button>
        </CardContent>
      </Card>

      {/* Bridge Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle>Bridge ETH</CardTitle>
          <CardDescription>Transfer ETH between L1 and L2 via Hyperlane</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Deposit (L1 -> L2) */}
          <div className="space-y-3">
            <Label>Deposit (L1 &rarr; L2)</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Amount in ETH"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                disabled={isDepositing}
              />
              <Button
                onClick={handleDeposit}
                disabled={isDepositing || !depositAmount}
                className="min-w-[100px]"
              >
                {isDepositing ? "Sending..." : "Deposit"}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Withdraw (L2 -> L1) */}
          <div className="space-y-3">
            <Label>Withdraw (L2 &rarr; L1)</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Amount in ETH"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                disabled={isWithdrawing}
              />
              <Button
                onClick={handleWithdraw}
                disabled={isWithdrawing || !withdrawAmount}
                className="min-w-[100px]"
              >
                {isWithdrawing ? "Sending..." : "Withdraw"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Recent Bridge Transactions</CardTitle>
          <CardDescription>Track your bridge transfers</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No bridge transactions yet. Use the buttons above to bridge ETH.
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <Badge variant={tx.direction === "deposit" ? "default" : "secondary"}>
                      {tx.direction === "deposit" ? "L1 \u2192 L2" : "L2 \u2192 L1"}
                    </Badge>
                    <span className="font-mono">{tx.amount} ETH</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge
                      variant={
                        tx.status === "completed" ? "default" :
                        tx.status === "failed" ? "destructive" :
                        "outline"
                      }
                      className={
                        tx.status === "completed" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                        tx.status === "relaying" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                        tx.status === "pending" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
                        ""
                      }
                    >
                      {tx.status}
                    </Badge>
                    {tx.txHash && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {tx.txHash}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {tx.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contract Info */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Hyperlane Configuration</CardTitle>
          <CardDescription className="flex items-center gap-2 flex-wrap">
            Deployed contract addresses
            {deploymentStatus === "loading" && (
              <Badge variant="outline" className="text-xs">loading...</Badge>
            )}
            {deploymentStatus === "success" && loadedFromDynamic && (
              <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
                ✓ dynamic
              </Badge>
            )}
            {deploymentStatus === "unknown" && !loadedFromDynamic && (
              <Badge variant="outline" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                default
              </Badge>
            )}
            {deploymentStatus === "failed" && (
              <Badge variant="destructive" className="text-xs">
                ✗ deployment failed
              </Badge>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <Label className="text-muted-foreground">L1 (Domain: {addresses.l1DomainId})</Label>
              <div className="space-y-1">
                <div><span className="text-muted-foreground">Mailbox: </span><span className="font-mono text-xs">{addresses.l1Mailbox}</span></div>
                <div><span className="text-muted-foreground">Warp Route: </span><span className="font-mono text-xs">{addresses.l1WarpRoute}</span></div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">L2 (Domain: {addresses.l2DomainId})</Label>
              <div className="space-y-1">
                <div><span className="text-muted-foreground">Mailbox: </span><span className="font-mono text-xs">{addresses.l2Mailbox}</span></div>
                <div><span className="text-muted-foreground">Warp Route: </span><span className="font-mono text-xs">{addresses.l2WarpRoute}</span></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
