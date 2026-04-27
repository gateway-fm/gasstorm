"use client";

import { useMemo, useRef, useEffect, useCallback } from "react";
import { useActivityFeedStore } from "@/stores/activity-feed-store";
import { ActivityFeedEvent } from "./activity-feed-event";
import { SOURCE_LABELS, SOURCE_COLORS } from "@/types/activity";
import type { ActivitySource } from "@/types/activity";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ActivityFeed() {
  const events = useActivityFeedStore((s) => s.events);
  const searchQuery = useActivityFeedStore((s) => s.searchQuery);
  const activeSourceFilters = useActivityFeedStore((s) => s.activeSourceFilters);
  const setSearchQuery = useActivityFeedStore((s) => s.setSearchQuery);
  const toggleSourceFilter = useActivityFeedStore((s) => s.toggleSourceFilter);
  const clearFilters = useActivityFeedStore((s) => s.clearFilters);

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(events.length);

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    if (events.length > prevCountRef.current && scrollRef.current) {
      // ScrollArea viewport is the actual scrollable element
      const viewport = scrollRef.current.querySelector('[data-slot="scroll-area-viewport"]');
      if (viewport) {
        viewport.scrollTop = 0;
      }
    }
    prevCountRef.current = events.length;
  }, [events.length]);

  // Collect sources that have events for the filter bar
  const sourcesWithEvents = useMemo(() => {
    const sources = new Set<ActivitySource>();
    for (const e of events) {
      sources.add(e.source);
    }
    return Array.from(sources).sort();
  }, [events]);

  // Filter events
  const filteredEvents = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return events.filter((e) => {
      if (activeSourceFilters.size > 0 && !activeSourceFilters.has(e.source)) {
        return false;
      }
      if (query && !e.message.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [events, searchQuery, activeSourceFilters]);

  const searchRef = useRef<HTMLInputElement>(null);
  const hasFilters = searchQuery.length > 0 || activeSourceFilters.size > 0;

  // Focus search on "/" key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="rounded-lg border bg-card text-card-foreground h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-2">
        <h3 className="text-sm font-medium text-muted-foreground">Activity Feed</h3>
        {events.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-xs text-muted-foreground">
              {filteredEvents.length === events.length
                ? `${events.length} events`
                : `${filteredEvents.length} / ${events.length} events`}
            </span>
          </div>
        )}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-sm bg-muted/50 border border-border rounded-md pl-9 pr-9 py-1.5 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {!searchQuery && (
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-muted-foreground/50 border border-border rounded px-1.5 py-0.5 font-mono bg-background">/</kbd>
          )}
        </div>
      </div>

      {/* Source filter badges */}
      {sourcesWithEvents.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {sourcesWithEvents.map((source) => {
            const isActive = activeSourceFilters.has(source);
            return (
              <button
                key={source}
                onClick={() => toggleSourceFilter(source)}
                className={`text-[10px] font-medium px-2 py-0.5 rounded transition-all ${
                  isActive
                    ? SOURCE_COLORS[source]
                    : activeSourceFilters.size > 0
                      ? "bg-muted/30 text-muted-foreground/50"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                {SOURCE_LABELS[source]}
              </button>
            );
          })}
        </div>
      )}

      {/* Event list */}
      <div ref={scrollRef} className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          {filteredEvents.length > 0 ? (
            filteredEvents.map((event) => (
              <ActivityFeedEvent key={event.id} event={event} />
            ))
          ) : (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">
              {events.length === 0
                ? "No events yet — waiting for activity..."
                : "No events match your filters"}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
