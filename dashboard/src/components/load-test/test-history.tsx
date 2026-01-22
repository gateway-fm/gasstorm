"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Star } from "lucide-react";
import type { TestResult, TimeSeriesPoint, TestRunMetadataUpdate } from "@/types/load-test";
import { TxLogViewer } from "./tx-log-viewer";
import { HistoryItemCard, type HistoryItem } from "./history-item-card";
import { transformTestRun, transformTimeSeriesPoint } from "./history-transforms";

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

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleExpand = (testId: string) => {
    if (expanded === testId) {
      setExpanded(null);
    } else {
      setExpanded(testId);
      fetchTestDetail(testId);
    }
  };

  const filteredHistory = showFavoritesOnly
    ? history.filter((h) => h.isFavorite)
    : history;

  const favoriteCount = history.filter((h) => h.isFavorite).length;

  const renderHistoryList = () => (
    <>
      {filteredHistory.map((result, index) => (
        <HistoryItemCard
          key={result.id || `history-${index}`}
          result={result}
          expanded={expanded === result.id}
          onToggleExpand={() => handleExpand(result.id)}
          timeSeries={timeSeries[result.id]}
          loadingDetail={loadingDetail === result.id}
          editingName={editingNameId === result.id}
          editingNameValue={editingNameValue}
          onEditingNameChange={setEditingNameValue}
          onSaveName={() => saveName(result.id, editingNameValue)}
          onCancelEditName={() => setEditingNameId(null)}
          onStartEditName={() => startEditingName(result.id, result.customName)}
          onToggleFavorite={() => toggleFavorite(result.id, result.isFavorite ?? false)}
          onViewFullResults={() => router.push(`/load-test/history?id=${result.id}`)}
          onViewTxLogs={() => setTxLogViewerId(result.id)}
          onDelete={() => deleteTest(result.id)}
        />
      ))}
    </>
  );

  if (history.length === 0) {
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
              variant={showFavoritesOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className="h-8 gap-1"
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
