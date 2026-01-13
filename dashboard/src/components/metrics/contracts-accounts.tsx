"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TestRun, AccountInfo, AccountRole } from "@/types/load-test";
import { FileCode, Users, Copy, ChevronDown, ChevronUp, Wallet, Send, CircleDot, Coins } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ContractsAccountsProps {
  testRun: TestRun;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

// Role display configuration
const ROLE_CONFIG: Record<AccountRole, {
  label: string;
  description: string;
  color: string;
  icon: React.ReactNode;
}> = {
  deployer: {
    label: "Deployer",
    description: "Reserved for contract deployment",
    color: "text-purple-400 bg-purple-400/10 border-purple-400/20",
    icon: <FileCode className="h-3 w-3" />,
  },
  funder: {
    label: "Funder",
    description: "Funds dynamic accounts (premined)",
    color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    icon: <Coins className="h-3 w-3" />,
  },
  funded: {
    label: "Funded",
    description: "Generated and funded for test",
    color: "text-green-400 bg-green-400/10 border-green-400/20",
    icon: <Send className="h-3 w-3" />,
  },
  "built-in": {
    label: "Built-in",
    description: "Premined test account",
    color: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    icon: <Wallet className="h-3 w-3" />,
  },
};

// Group accounts by role
function groupAccountsByRole(accounts: AccountInfo[]): Record<AccountRole, AccountInfo[]> {
  const groups: Record<AccountRole, AccountInfo[]> = {
    deployer: [],
    funder: [],
    funded: [],
    "built-in": [],
  };

  for (const account of accounts) {
    if (groups[account.role]) {
      groups[account.role].push(account);
    }
  }

  return groups;
}

// Component for a single account row
function AccountRow({ account, showRole = false }: { account: AccountInfo; showRole?: boolean }) {
  const config = ROLE_CONFIG[account.role];

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded text-xs font-mono bg-muted/20 hover:bg-muted/40 transition-colors">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-muted-foreground w-8 shrink-0">#{account.index}</span>
        {showRole && (
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", config.color)}>
            {config.icon}
            <span className="ml-1">{config.label}</span>
          </Badge>
        )}
        <span className="text-muted-foreground truncate">{account.address}</span>
      </div>
      <button
        onClick={() => copyToClipboard(account.address)}
        className="p-1 hover:bg-muted rounded transition-colors shrink-0 ml-2"
        title="Copy address"
      >
        <Copy className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );
}

// Expandable account group
function AccountGroup({
  role,
  accounts,
  defaultExpanded = false,
}: {
  role: AccountRole;
  accounts: AccountInfo[];
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const config = ROLE_CONFIG[role];

  if (accounts.length === 0) return null;

  const displayAccounts = expanded ? accounts : accounts.slice(0, 3);
  const hasMore = accounts.length > 3;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-xs", config.color)}>
            {config.icon}
            <span className="ml-1">{config.label}</span>
          </Badge>
          <span className="text-sm text-muted-foreground">
            {accounts.length} account{accounts.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{config.description}</span>
          {hasMore && (
            expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </button>

      <div className="px-2 pb-2 space-y-1">
        {displayAccounts.map((account) => (
          <AccountRow key={account.address} account={account} />
        ))}
        {!expanded && hasMore && (
          <div className="text-center py-1">
            <span className="text-xs text-muted-foreground">
              +{accounts.length - 3} more
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ContractsAccounts({ testRun }: ContractsAccountsProps) {
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const { deployedContracts, testAccounts } = testRun;

  // Group accounts by role
  const groupedAccounts = useMemo(() => {
    if (!testAccounts?.allAccounts) return null;
    return groupAccountsByRole(testAccounts.allAccounts);
  }, [testAccounts?.allAccounts]);

  // Don't render if no data
  if (!deployedContracts?.length && !testAccounts) {
    return null;
  }

  // Calculate totals for summary
  const totalBuiltIn = testAccounts?.allAccounts
    ? testAccounts.allAccounts.filter((a) => a.role === "deployer" || a.role === "funder").length
    : 0;
  const totalDynamic = testAccounts?.dynamicCount ?? 0;
  const totalFunded = testAccounts?.fundedCount ?? 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Deployed Contracts */}
      {deployedContracts && deployedContracts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileCode className="h-4 w-4" />
              Deployed Contracts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deployedContracts.map((contract) => (
                <div
                  key={contract.address}
                  className="flex items-center justify-between p-2 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      {contract.name}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-muted-foreground">
                      {contract.address}
                    </code>
                    <button
                      onClick={() => copyToClipboard(contract.address)}
                      className="p-1 hover:bg-muted rounded transition-colors"
                      title="Copy full address"
                    >
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Accounts */}
      {testAccounts && (
        <Card className={deployedContracts?.length ? "" : "md:col-span-2"}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Test Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="text-center p-2 rounded-lg border">
                <div className="text-lg font-bold text-blue-400">
                  {testAccounts.totalCount}
                </div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="text-center p-2 rounded-lg border">
                <div className="text-lg font-bold text-yellow-400">
                  {totalBuiltIn}
                </div>
                <div className="text-xs text-muted-foreground">Built-in</div>
              </div>
              <div className="text-center p-2 rounded-lg border">
                <div className="text-lg font-bold text-green-400">
                  {totalFunded}/{totalDynamic}
                </div>
                <div className="text-xs text-muted-foreground">Funded/Dynamic</div>
              </div>
            </div>

            {/* Account groups - show if we have the new allAccounts data */}
            {groupedAccounts ? (
              <div className="space-y-2">
                <AccountGroup role="deployer" accounts={groupedAccounts.deployer} defaultExpanded />
                <AccountGroup role="funder" accounts={groupedAccounts.funder} defaultExpanded />
                <AccountGroup role="funded" accounts={groupedAccounts.funded} />
              </div>
            ) : (
              /* Legacy: flat address list if allAccounts not available */
              <>
                {testAccounts.funderAddress && (
                  <div className="mb-4 p-2 rounded-lg border bg-muted/30">
                    <div className="text-xs text-muted-foreground mb-1">Funder (Deployer)</div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono flex-1">
                        {testAccounts.funderAddress}
                      </code>
                      <button
                        onClick={() => copyToClipboard(testAccounts.funderAddress)}
                        className="p-1 hover:bg-muted rounded transition-colors"
                        title="Copy full address"
                      >
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                )}

                {testAccounts.accounts && testAccounts.accounts.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">
                      Account Addresses ({testAccounts.accounts.length} shown)
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {(showAllAccounts ? testAccounts.accounts : testAccounts.accounts.slice(0, 5)).map((addr, idx) => (
                        <div
                          key={addr}
                          className="flex items-center justify-between py-1 px-2 rounded text-xs font-mono bg-muted/20 hover:bg-muted/40 transition-colors"
                        >
                          <span className="text-muted-foreground w-6">{idx + 1}.</span>
                          <span className="flex-1 text-muted-foreground truncate">{addr}</span>
                          <button
                            onClick={() => copyToClipboard(addr)}
                            className="p-1 hover:bg-muted rounded transition-colors"
                            title="Copy full address"
                          >
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {testAccounts.accounts.length > 5 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 text-xs"
                        onClick={() => setShowAllAccounts(!showAllAccounts)}
                      >
                        {showAllAccounts ? (
                          <>
                            <ChevronUp className="h-3 w-3 mr-1" />
                            Show Less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3 mr-1" />
                            Show All ({testAccounts.accounts.length})
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
