"use client";

export default function BridgePage() {
  return (
    <div className="h-[calc(100vh-4rem)] w-full">
      <iframe
        src="http://localhost:18001"
        className="h-full w-full border-0"
        title="Hyperlane Bridge"
        allow="clipboard-write"
      />
    </div>
  );
}
