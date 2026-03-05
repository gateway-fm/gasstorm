"use client";

import { useRef, useCallback } from "react";
import { getServiceUrl } from "@/lib/host";

interface ServiceIframeProps {
  port: number;
  path?: string;
  title: string;
}

export function ServiceIframe({ port, path = "", title }: ServiceIframeProps) {
  const ref = useRef<HTMLIFrameElement>(null);

  const setRef = useCallback(
    (el: HTMLIFrameElement | null) => {
      if (el) {
        el.src = getServiceUrl(port, path);
      }
      (ref as React.MutableRefObject<HTMLIFrameElement | null>).current = el;
    },
    [port, path],
  );

  return (
    <iframe
      ref={setRef}
      title={title}
      className="w-full h-[calc(100vh-7rem)] border-0"
      allow="clipboard-read; clipboard-write"
    />
  );
}
