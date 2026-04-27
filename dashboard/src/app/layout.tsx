import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { WebSocketProvider } from "@/contexts/websocket-context";
import { ChainDataPoller } from "@/components/layout/chain-data-poller";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GasStorm",
  description: "GasStorm | Engine API Block Builder | Load Testing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased h-screen flex flex-col overflow-hidden font-sans`}
      >
        <WebSocketProvider>
          <ChainDataPoller />
          <Header />
          <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
          <Footer />
        </WebSocketProvider>
        <Toaster />
      </body>
    </html>
  );
}
