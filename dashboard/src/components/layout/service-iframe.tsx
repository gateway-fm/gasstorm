"use client";

interface ServiceIframeProps {
  src: string;
  title: string;
}

export function ServiceIframe({ src, title }: ServiceIframeProps) {
  return (
    <iframe
      src={src}
      title={title}
      className="w-full h-[calc(100vh-7rem)] border-0"
      allow="clipboard-read; clipboard-write"
    />
  );
}
