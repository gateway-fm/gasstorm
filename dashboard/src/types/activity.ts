export type ActivitySource =
  | "l1"
  | "l2"
  | "builder"
  | "loadgen"
  | "explorer"
  | "explorer-l1"
  | "privacy"
  | "bridge"
  | "blobda"
  | "dashboard";

export type ActivityCategory = "block" | "health" | "loadtest" | "transaction" | "system";

export type ActivitySeverity = "info" | "success" | "warning" | "error";

export interface ActivityEvent {
  id: string;
  timestamp: Date;
  source: ActivitySource;
  category: ActivityCategory;
  severity: ActivitySeverity;
  message: string;
  metadata?: Record<string, string | number | boolean>;
}

export const SOURCE_LABELS: Record<ActivitySource, string> = {
  l1: "L1",
  l2: "L2",
  builder: "Builder",
  loadgen: "Load Gen",
  explorer: "Explorer",
  "explorer-l1": "L1 Explorer",
  privacy: "Privacy",
  bridge: "Bridge",
  blobda: "Blob DA",
  dashboard: "Dashboard",
};

export const SOURCE_COLORS: Record<ActivitySource, string> = {
  l1: "bg-blue-500/20 text-blue-400",
  l2: "bg-purple-500/20 text-purple-400",
  builder: "bg-amber-500/20 text-amber-400",
  loadgen: "bg-green-500/20 text-green-400",
  explorer: "bg-cyan-500/20 text-cyan-400",
  "explorer-l1": "bg-sky-500/20 text-sky-400",
  privacy: "bg-rose-500/20 text-rose-400",
  bridge: "bg-teal-500/20 text-teal-400",
  blobda: "bg-orange-500/20 text-orange-400",
  dashboard: "bg-zinc-500/20 text-zinc-400",
};
