"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TestRun } from "@/types/load-test";
import { FileCode, Users, Copy, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ContractsAccountsProps {
  testRun: TestRun;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

export function ContractsAccounts({ testRun }: ContractsAccountsProps) {
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const { deployedContracts, testAccounts } = testRun;

  // Don't render if no data
  if (!deployedContracts?.length && !testAccounts) {
    return null;
  }

  const displayedAccounts = showAllAccounts
    ? testAccounts?.accounts || []
    : (testAccounts?.accounts || []).slice(0, 5);

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
        <Card>
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
                <div className="text-lg font-bold text-purple-400">
                  {testAccounts.dynamicCount}
                </div>
                <div className="text-xs text-muted-foreground">Dynamic</div>
              </div>
              <div className="text-center p-2 rounded-lg border">
                <div className="text-lg font-bold text-green-400">
                  {testAccounts.fundedCount}
                </div>
                <div className="text-xs text-muted-foreground">Funded</div>
              </div>
            </div>

            {/* Funder address */}
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

            {/* Account list */}
            {testAccounts.accounts && testAccounts.accounts.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-2">
                  Account Addresses ({testAccounts.accounts.length} shown)
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {displayedAccounts.map((addr, idx) => (
                    <div
                      key={addr}
                      className="flex items-center justify-between py-1 px-2 rounded text-xs font-mono bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <span className="text-muted-foreground w-6">{idx + 1}.</span>
                      <span className="flex-1 text-muted-foreground">
                        {addr}
                      </span>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
