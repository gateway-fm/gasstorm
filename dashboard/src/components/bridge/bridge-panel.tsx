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
import { RPC_ENDPOINTS, HYPERLANE_CONTRACTS, TEST_ACCOUNT, WARP_ROUTE_ABI } from "@/types/chain";

interface BridgeTransaction {
  id: string;
  direction: "deposit" | "withdraw";
  amount: string;
  status: "pending" | "relaying" | "completed" | "failed";
  txHash: string;
  timestamp: Date;
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

  const fetchBalances = useCallback(async () => {
    try {
      const [l1Bal, l2Bal, l1Warp, l2Warp] = await Promise.all([
        l1.getBalance(TEST_ACCOUNT.address),
        l2.getBalance(TEST_ACCOUNT.address),
        l1.getBalance(HYPERLANE_CONTRACTS.L1_WARP_ROUTE),
        l2.getBalance(HYPERLANE_CONTRACTS.L2_WARP_ROUTE),
      ]);
      setL1Balance(l1Bal);
      setL2Balance(l2Bal);
      setL1WarpBalance(l1Warp);
      setL2WarpBalance(l2Warp);
    } catch {
      // Silent fail for balance fetches
    }
  }, []);

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
      const wallet = new ethers.Wallet(TEST_ACCOUNT.privateKey, provider);

      // Create contract interface
      const warpRoute = new ethers.Contract(
        HYPERLANE_CONTRACTS.L1_WARP_ROUTE,
        WARP_ROUTE_ABI,
        wallet
      );

      // Pad recipient address to bytes32
      const recipientPadded = ethers.zeroPadValue(TEST_ACCOUNT.address, 32);
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

      // Send transaction
      const tx = await warpRoute.transferRemote(
        HYPERLANE_CONTRACTS.L2_DOMAIN_ID,
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

      // Poll for L2 balance increase (relayer delivery)
      const startBalance = await l2.getBalance(TEST_ACCOUNT.address);
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds

      const checkDelivery = setInterval(async () => {
        attempts++;
        const currentBalance = await l2.getBalance(TEST_ACCOUNT.address);

        if (currentBalance > startBalance) {
          clearInterval(checkDelivery);
          setTransactions(prev => prev.map(t =>
            t.id === txId ? { ...t, status: "completed" } : t
          ));
          toast.success(`Deposit completed! ${depositAmount} ETH arrived on L2`);
          fetchBalances();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkDelivery);
          setTransactions(prev => prev.map(t =>
            t.id === txId ? { ...t, status: "relaying" } : t
          ));
          toast.info("Relayer may still be processing. Check balances later.");
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
      const wallet = new ethers.Wallet(TEST_ACCOUNT.privateKey, provider);

      // Create contract interface
      const warpRoute = new ethers.Contract(
        HYPERLANE_CONTRACTS.L2_WARP_ROUTE,
        WARP_ROUTE_ABI,
        wallet
      );

      // Pad recipient address to bytes32
      const recipientPadded = ethers.zeroPadValue(TEST_ACCOUNT.address, 32);
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

      // Send transaction
      const tx = await warpRoute.transferRemote(
        HYPERLANE_CONTRACTS.L1_DOMAIN_ID,
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

      // Poll for L1 balance increase (relayer delivery)
      const startBalance = await l1.getBalance(TEST_ACCOUNT.address);
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds

      const checkDelivery = setInterval(async () => {
        attempts++;
        const currentBalance = await l1.getBalance(TEST_ACCOUNT.address);

        if (currentBalance > startBalance) {
          clearInterval(checkDelivery);
          setTransactions(prev => prev.map(t =>
            t.id === txId ? { ...t, status: "completed" } : t
          ));
          toast.success(`Withdrawal completed! ${withdrawAmount} ETH arrived on L1`);
          fetchBalances();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkDelivery);
          setTransactions(prev => prev.map(t =>
            t.id === txId ? { ...t, status: "relaying" } : t
          ));
          toast.info("Relayer may still be processing. Check balances later.");
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
          <CardDescription>Account: {TEST_ACCOUNT.address.slice(0, 10)}...{TEST_ACCOUNT.address.slice(-8)}</CardDescription>
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
                        {tx.txHash.slice(0, 10)}...
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
          <CardDescription>Deployed contract addresses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <Label className="text-muted-foreground">L1 (Domain: {HYPERLANE_CONTRACTS.L1_DOMAIN_ID})</Label>
              <div className="space-y-1">
                <div><span className="text-muted-foreground">Mailbox: </span><span className="font-mono text-xs">{HYPERLANE_CONTRACTS.L1_MAILBOX}</span></div>
                <div><span className="text-muted-foreground">Warp Route: </span><span className="font-mono text-xs">{HYPERLANE_CONTRACTS.L1_WARP_ROUTE}</span></div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">L2 (Domain: {HYPERLANE_CONTRACTS.L2_DOMAIN_ID})</Label>
              <div className="space-y-1">
                <div><span className="text-muted-foreground">Mailbox: </span><span className="font-mono text-xs">{HYPERLANE_CONTRACTS.L2_MAILBOX}</span></div>
                <div><span className="text-muted-foreground">Warp Route: </span><span className="font-mono text-xs">{HYPERLANE_CONTRACTS.L2_WARP_ROUTE}</span></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
