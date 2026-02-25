import { create } from "zustand";
import type {
  ActivityEvent,
  ActivitySource,
  ActivityCategory,
  ActivitySeverity,
} from "@/types/activity";

const MAX_EVENTS = 500;

interface ActivityFeedState {
  events: ActivityEvent[];
  searchQuery: string;
  activeSourceFilters: Set<ActivitySource>;
  activeCategoryFilters: Set<ActivityCategory>;
}

interface ActivityFeedActions {
  addEvent: (
    source: ActivitySource,
    category: ActivityCategory,
    severity: ActivitySeverity,
    message: string,
    metadata?: Record<string, string | number | boolean>,
  ) => void;
  setSearchQuery: (query: string) => void;
  toggleSourceFilter: (source: ActivitySource) => void;
  toggleCategoryFilter: (category: ActivityCategory) => void;
  clearFilters: () => void;
  clearEvents: () => void;
}

type ActivityFeedStore = ActivityFeedState & ActivityFeedActions;

export const useActivityFeedStore = create<ActivityFeedStore>((set) => ({
  events: [],
  searchQuery: "",
  activeSourceFilters: new Set(),
  activeCategoryFilters: new Set(),

  addEvent: (source, category, severity, message, metadata) =>
    set((state) => {
      const event: ActivityEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date(),
        source,
        category,
        severity,
        message,
        metadata,
      };
      return { events: [event, ...state.events].slice(0, MAX_EVENTS) };
    }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleSourceFilter: (source) =>
    set((state) => {
      const next = new Set(state.activeSourceFilters);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return { activeSourceFilters: next };
    }),

  toggleCategoryFilter: (category) =>
    set((state) => {
      const next = new Set(state.activeCategoryFilters);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return { activeCategoryFilters: next };
    }),

  clearFilters: () =>
    set({
      searchQuery: "",
      activeSourceFilters: new Set(),
      activeCategoryFilters: new Set(),
    }),

  clearEvents: () => set({ events: [] }),
}));
