"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Star, GitCompare, X } from "lucide-react";
import type { TestResult, TimeSeriesPoint, TestRunMetadataUpdate } from "@/types/load-test";
import { TxLogViewer } from "./tx-log-viewer";
import { HistoryItemCard, type HistoryItem } from "./history-item-card";
import { transformTestRun, transformTimeSeriesPoint } from "./history-transforms";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";

const LOAD_GEN_API = "/api/loadgen";

interface TestHistoryProps {
  /** When true, uses full available height instead of fixed 400px scroll area */
  fullPage?: boolean;
}

export function TestHistory({ fullPage = false }: TestHistoryProps) {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [timeSeries, setTimeSeries] = useState<Record<string, TimeSeriesPoint[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [txLogViewerId, setTxLogViewerId] = useState<string | null>(null);
  const [txLoggingEnabled, setTxLoggingEnabled] = useState<boolean>(true);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [ghostEntry, setGhostEntry] = useState<HistoryItem | null>(null);

  // Subscribe to load test status to detect when tests complete
  const testStatus = useGoLoadTestStore((s) => s.status);
  const testConfig = useGoLoadTestStore((s) => s.config);
  const txSentCount = useGoLoadTestStore((s) => s.txSentCount);
  const txConfirmedCount = useGoLoadTestStore((s) => s.txConfirmedCount);
  const txFailedCount = useGoLoadTestStore((s) => s.txFailedCount);
  const averageTps = useGoLoadTestStore((s) => s.averageTps);
  const peakTps = useGoLoadTestStore((s) => s.peakTps);
  const elapsedTime = useGoLoadTestStore((s) => s.elapsedTime);
  const prevStatusRef = useRef(testStatus);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${LOAD_GEN_API}/history?limit=50&offset=0`);
      if (response.ok) {
        const data = await response.json();
        const runs = data.Runs || data.runs;
        if (runs) {
          setHistory(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            runs.map((rawRun: any) => {
              const run = transformTestRun(rawRun);
              return {
                id: run.id,
                startedAt: run.startedAt,
                completedAt: run.completedAt || "",
                pattern: run.pattern,
                transactionType: run.transactionType,
                durationMs: run.durationMs,
                txSent: run.txSent,
                txConfirmed: run.txConfirmed,
                txFailed: run.txFailed,
                averageTps: run.averageTps,
                peakTps: run.peakTps,
                latency: run.latencyStats,
                preconfLatency: run.preconfLatency,
                config: run.config || {
                  pattern: run.pattern,
                  durationSec: Math.round(run.durationMs / 1000),
                },
                txLoggingEnabled: run.txLoggingEnabled,
                executionLayer: run.executionLayer,
                customName: run.customName,
                isFavorite: run.isFavorite,
              };
            })
          );
        } else {
          setHistory((data as TestResult[]).reverse());
        }
      }
    } catch {
      // Silently fail - service might not be ready
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTestDetail = useCallback(async (testId: string) => {
    if (timeSeries[testId]) return;

    setLoadingDetail(testId);
    try {
      const response = await fetch(`${LOAD_GEN_API}/history/${testId}`);
      if (response.ok) {
        const rawData = await response.json();
        const rawRun = rawData.Run || rawData.run;
        const rawTimeSeries = rawData.TimeSeries || rawData.timeSeries || [];

        const transformedTimeSeries = rawTimeSeries.map(transformTimeSeriesPoint);

        if (transformedTimeSeries.length > 0) {
          setTimeSeries((prev) => ({ ...prev, [testId]: transformedTimeSeries }));
        }
        if (rawRun) {
          const run = transformTestRun(rawRun);
          setTxLoggingEnabled(run.txLoggingEnabled);
        }
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingDetail(null);
    }
  }, [timeSeries]);

  const deleteTest = useCallback(async (testId: string) => {
    if (!confirm("Are you sure you want to delete this test run?")) return;

    try {
      const response = await fetch(`${LOAD_GEN_API}/history/${testId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setHistory((prev) => prev.filter((h) => h.id !== testId));
        if (expanded === testId) setExpanded(null);
      }
    } catch {
      // Silently fail
    }
  }, [expanded]);

  const updateMetadata = useCallback(async (testId: string, update: TestRunMetadataUpdate) => {
    try {
      const response = await fetch(`${LOAD_GEN_API}/history/${testId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (response.ok) {
        const rawResponse = await response.json();
        const updatedRun = transformTestRun(rawResponse);
        setHistory((prev) =>
          prev.map((h) =>
            h.id === testId
              ? { ...h, customName: updatedRun.customName, isFavorite: updatedRun.isFavorite }
              : h
          )
        );
      }
    } catch (err) {
      console.error("[TestHistory] Failed to update test metadata:", err);
    }
  }, []);

  const toggleFavorite = useCallback(async (testId: string, currentFavorite: boolean) => {
    await updateMetadata(testId, { isFavorite: !currentFavorite });
  }, [updateMetadata]);

  const saveName = useCallback(async (testId: string, name: string) => {
    await updateMetadata(testId, { customName: name.trim() || "" });
    setEditingNameId(null);
  }, [updateMetadata]);

  const startEditingName = useCallback((testId: string, currentName: string | undefined) => {
    setEditingNameId(testId);
    setEditingNameValue(currentName || "");
  }, []);

  const toggleCompareSelect = useCallback((testId: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(testId)) {
        return prev.filter((id) => id !== testId);
      }
      // Only allow selecting up to 2 tests
      if (prev.length >= 2) {
        return [...prev.slice(1), testId];
      }
      return [...prev, testId];
    });
  }, []);

  const exitCompareMode = useCallback(() => {
    setCompareMode(false);
    setSelectedForCompare([]);
  }, []);

  const navigateToCompare = useCallback(() => {
    if (selectedForCompare.length === 2) {
      router.push(`/load-test/history/compare?left=${selectedForCompare[0]}&right=${selectedForCompare[1]}`);
    }
  }, [router, selectedForCompare]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Create ghost entry when test transitions to verifying/completed
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = testStatus;

    // When transitioning to "verifying", create a ghost entry
    if (testStatus === "verifying" && prevStatus === "running") {
      const ghost: HistoryItem = {
        id: `ghost-${Date.now()}`,
        startedAt: new Date(Date.now() - elapsedTime * 1000).toISOString(),
        completedAt: new Date().toISOString(),
        pattern: testConfig?.pattern ?? "constant",
        transactionType: testConfig?.transactionType ?? "eth-transfer",
        durationMs: elapsedTime * 1000,
        txSent: txSentCount,
        txConfirmed: txConfirmedCount,
        txFailed: txFailedCount,
        averageTps,
        peakTps,
        config: {
          pattern: testConfig?.pattern ?? "constant",
          durationSec: testConfig?.duration ?? 60,
          constantRate: testConfig?.constantRate,
          rampStart: testConfig?.rampStart,
          rampEnd: testConfig?.rampEnd,
          rampSteps: testConfig?.rampSteps,
          baselineRate: testConfig?.baselineRate,
          spikeRate: testConfig?.spikeRate,
          spikeDuration: testConfig?.spikeDuration,
          spikeInterval: testConfig?.spikeInterval,
          adaptiveInitialRate: testConfig?.adaptiveInitialRate,
          adaptiveTargetPending: testConfig?.adaptiveTargetPending,
          adaptiveRateStep: testConfig?.adaptiveRateStep,
          realisticConfig: testConfig?.realisticConfig,
        },
        isSaving: true,
      };
      setGhostEntry(ghost);
    }

    // When test completes, auto-refresh history after a short delay
    // This gives the backend time to persist the data
    if (testStatus === "completed" && prevStatus === "verifying") {
      const timer = setTimeout(() => {
        fetchHistory().then(() => {
          // Clear ghost entry after successful fetch
          setGhostEntry(null);
        });
      }, 2000); // Wait 2s for persistence to complete
      return () => clearTimeout(timer);
    }

    // Clear ghost if user manually resets
    if (testStatus === "idle" && prevStatus !== "idle") {
      setGhostEntry(null);
    }
  }, [testStatus, testConfig, elapsedTime, txSentCount, txConfirmedCount, txFailedCount, averageTps, peakTps, fetchHistory]);

  const handleExpand = (testId: string) => {
    if (expanded === testId) {
      setExpanded(null);
    } else {
      setExpanded(testId);
      fetchTestDetail(testId);
    }
  };

  // Combine ghost entry with real history (ghost appears first if it exists)
  const historyWithGhost = ghostEntry ? [ghostEntry, ...history] : history;

  const filteredHistory = showFavoritesOnly
    ? historyWithGhost.filter((h) => h.isFavorite || h.isSaving)
    : historyWithGhost;

  const favoriteCount = history.filter((h) => h.isFavorite).length;

  const renderHistoryList = () => (
    <>
      {filteredHistory.map((result, index) => {
        const isSaving = result.isSaving ?? false;
        // Disable interactions for ghost/saving entries
        const noop = () => {};
        return (
        <HistoryItemCard
          key={result.id || `history-${index}`}
          result={result}
          expanded={!isSaving && expanded === result.id}
          onToggleExpand={isSaving ? noop : () => handleExpand(result.id)}
          timeSeries={timeSeries[result.id]}
          loadingDetail={loadingDetail === result.id}
          editingName={!isSaving && editingNameId === result.id}
          editingNameValue={editingNameValue}
          onEditingNameChange={setEditingNameValue}
          onSaveName={isSaving ? noop : () => saveName(result.id, editingNameValue)}
          onCancelEditName={isSaving ? noop : () => setEditingNameId(null)}
          onStartEditName={isSaving ? noop : () => startEditingName(result.id, result.customName)}
          onToggleFavorite={isSaving ? noop : () => toggleFavorite(result.id, result.isFavorite ?? false)}
          onViewFullResults={isSaving ? noop : () => router.push(`/load-test/history?id=${result.id}`)}
          onViewTxLogs={isSaving ? noop : () => setTxLogViewerId(result.id)}
          onDelete={isSaving ? noop : () => deleteTest(result.id)}
          compareMode={compareMode}
          selectedForCompare={selectedForCompare.includes(result.id)}
          onToggleCompareSelect={isSaving ? noop : () => toggleCompareSelect(result.id)}
        />
        );
      })}
    </>
  );

  if (history.length === 0 && !ghostEntry) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-semibold">Test History</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchHistory}
            disabled={loading}
            className="h-8 w-8"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground text-center py-8">
            No tests completed yet. Run a load test to see history.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-semibold">
            Test History ({filteredHistory.length}{showFavoritesOnly ? ` of ${history.length}` : ""})
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant={compareMode ? "default" : "outline"}
              size="sm"
              onClick={() => compareMode ? exitCompareMode() : setCompareMode(true)}
              className="h-8 gap-1"
            >
              {compareMode ? (
                <>
                  <X className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Cancel</span>
                </>
              ) : (
                <>
                  <GitCompare className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Compare</span>
                </>
              )}
            </Button>
            <Button
              variant={showFavoritesOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className="h-8 gap-1"
              disabled={compareMode}
            >
              <Star className={`h-3.5 w-3.5 ${showFavoritesOnly ? "fill-current" : ""}`} />
              <span className="hidden sm:inline">Favorites</span>
              {favoriteCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {favoriteCount}
                </Badge>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchHistory}
              disabled={loading}
              className="h-8 w-8"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {compareMode && (
            <div className="mb-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded-md text-sm text-blue-400">
              Select 2 tests to compare. {selectedForCompare.length}/2 selected.
            </div>
          )}
          {fullPage ? (
            <div className="space-y-2">
              {renderHistoryList()}
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {renderHistoryList()}
              </div>
            </ScrollArea>
          )}
          {/* Floating Compare button */}
          {compareMode && selectedForCompare.length === 2 && (
            <div className="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-background via-background to-transparent">
              <Button
                className="w-full gap-2"
                onClick={navigateToCompare}
              >
                <GitCompare className="h-4 w-4" />
                Compare Selected (2)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <TxLogViewer
        testId={txLogViewerId || ""}
        open={!!txLogViewerId}
        onClose={() => setTxLogViewerId(null)}
        txLoggingEnabled={txLoggingEnabled}
      />
    </>
  );
}
