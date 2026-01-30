"use client";

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useComparison } from "@/hooks/use-comparison";
import { CompareHeader } from "@/components/load-test/compare/compare-header";
import { CompareConfig } from "@/components/load-test/compare/compare-config";
import { ComparePerformance } from "@/components/load-test/compare/compare-performance";
import { CompareVerification } from "@/components/load-test/compare/compare-verification";
import { CompareLatency } from "@/components/load-test/compare/compare-latency";

function getTestLabel(test: { customName?: string; pattern: string }, fallback: string): string {
  if (test.customName) return test.customName;
  const patternLabels: Record<string, string> = {
    constant: "Constant",
    ramp: "Ramp",
    spike: "Spike",
    adaptive: "Adaptive",
    realistic: "Realistic",
  };
  return `${patternLabels[test.pattern] || test.pattern} Test`;
}

function ComparePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leftId = searchParams.get("left");
  const rightId = searchParams.get("right");

  const { testA, testB, loading, error, swap } = useComparison(leftId, rightId);

  const handleBack = useCallback(() => {
    router.push("/load-test/history");
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !testA || !testB) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div>
              <h2 className="text-lg font-semibold">Error Loading Comparison</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {error || "Could not load both tests for comparison"}
              </p>
            </div>
            <Button onClick={handleBack} variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to History
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const labelA = getTestLabel(testA, "Test A");
  const labelB = getTestLabel(testB, "Test B");

  return (
    <>
      <div className="mb-6">
        <CompareHeader
          testA={testA}
          testB={testB}
          onSwap={swap}
          onBack={handleBack}
        />
      </div>

      <div className="space-y-4">
        {/* Section 1: Configuration Differences */}
        <CompareConfig
          testA={testA}
          testB={testB}
          labelA={labelA}
          labelB={labelB}
        />

        {/* Section 2: Performance Differences */}
        <ComparePerformance
          testA={testA}
          testB={testB}
          labelA={labelA}
          labelB={labelB}
        />

        {/* Section 3: Verification & Reverts */}
        <CompareVerification
          testA={testA}
          testB={testB}
          labelA={labelA}
          labelB={labelB}
        />

        {/* Section 4: Latency Comparison */}
        <CompareLatency
          testA={testA}
          testB={testB}
          labelA={labelA}
          labelB={labelB}
        />
      </div>
    </>
  );
}

export default function ComparePage() {
  return (
    <div className="min-h-screen bg-background">
      <Suspense
        fallback={
          <main className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </main>
        }
      >
        <main className="container mx-auto px-4 py-6">
          <ComparePageContent />
        </main>
      </Suspense>
    </div>
  );
}
