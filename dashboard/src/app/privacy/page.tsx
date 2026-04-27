"use client";

import { useState, useCallback } from "react";
import { getServiceUrl } from "@/lib/host";

type TabId = "login" | "admin";

const tabs: { id: TabId; label: string; path: string }[] = [
  { id: "login", label: "Login", path: "" },
  { id: "admin", label: "Admin", path: "/admin/dashboard" },
];

// Direct URL to the privacy UI (bypasses /proxy/ path prefix which breaks SPA routing).
// Set NEXT_PUBLIC_PRIVACY_UI_URL at build time for remote deploys where the privacy UI
// is on a separate server (e.g. http://explorer-ip:18301).
const privacyUiUrl = process.env.NEXT_PUBLIC_PRIVACY_UI_URL || "";

function getPrivacyUrl(path: string): string {
  if (privacyUiUrl) {
    return `${privacyUiUrl}${path}`;
  }
  return getServiceUrl(18301, path);
}

function PrivacyIframe({ path, title, visible }: { path: string; title: string; visible: boolean }) {
  const setRef = useCallback(
    (el: HTMLIFrameElement | null) => {
      if (el) {
        el.src = getPrivacyUrl(path);
      }
    },
    [path],
  );

  return (
    <iframe
      ref={setRef}
      title={title}
      className="absolute inset-0 w-full h-full border-0"
      style={{ display: visible ? "block" : "none" }}
      allow="clipboard-read; clipboard-write"
    />
  );
}

export default function PrivacyPage() {
  const [activeTab, setActiveTab] = useState<TabId>("login");

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      <div className="flex gap-1 px-4 pt-2 pb-0 border-b border-border bg-background">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === tab.id
                ? "bg-muted text-foreground border border-b-0 border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 relative">
        {tabs.map((tab) => (
          <PrivacyIframe
            key={tab.id}
            path={tab.path}
            title={`Privacy ${tab.label}`}
            visible={activeTab === tab.id}
          />
        ))}
      </div>
    </div>
  );
}
