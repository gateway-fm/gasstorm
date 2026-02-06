import Link from "next/link";
import {
  Zap,
  Timer,
  Bot,
  Blocks,
  Activity,
  LayoutDashboard,
  ArrowRight,
  Github,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(137,80,250,0.08),transparent_70%)]" />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 py-24 md:py-32">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              <span className="text-primary">GasStorm</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-4">
              Blockchain sequencer load testing framework with sub-second block
              times.
            </p>
            <p className="text-base text-muted-foreground mb-8 max-w-2xl">
              Orchestrates op-reth, an external block builder, and a
              high-throughput load generator to validate sequencer performance at
              up to 25,000 tx/s with real-time metrics.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/docs/getting-started">
                  Get Started
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a
                  href="https://github.com/gateway-fm/gasstorm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="size-4" />
                  GitHub
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="mx-auto max-w-7xl px-4 md:px-6 py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-card hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <Timer className="size-5 text-primary" />
              </div>
              <CardTitle className="text-lg">Sub-Second Blocks</CardTitle>
              <CardDescription>
                Block times as low as 50ms with configurable intervals. External
                block builder with Engine API pipeline for maximum throughput.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-card hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <Zap className="size-5 text-primary" />
              </div>
              <CardTitle className="text-lg">25K TX/s Throughput</CardTitle>
              <CardDescription>
                1 gigagas block gas limit with 25,000 max transactions per
                block. Real Uniswap V3 swaps, ERC20 transfers, and custom
                workloads.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-card hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <Bot className="size-5 text-primary" />
              </div>
              <CardTitle className="text-lg">AI-Native (MCP)</CardTitle>
              <CardDescription>
                24 MCP tools for AI-driven stack management. Start tests,
                configure the builder, and inspect results conversationally
                via Claude Code or OpenCode.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Architecture Diagram */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-16 md:py-24">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">
            Architecture
          </h2>
          <div className="max-w-3xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Row 1: Load Generator */}
              <div className="md:col-span-3 rounded-lg border bg-card p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Activity className="size-4 text-primary" />
                  <span className="font-semibold">Load Generator</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  TX building, signing, sending via HTTP
                </p>
              </div>

              {/* Arrow */}
              <div className="md:col-span-3 flex justify-center text-muted-foreground">
                <svg
                  width="24"
                  height="32"
                  viewBox="0 0 24 32"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 0v24m0 0l-6-6m6 6l6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Row 2: Block Builder */}
              <div className="md:col-span-3 rounded-lg border-2 border-primary/30 bg-card p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Blocks className="size-4 text-primary" />
                  <span className="font-semibold">Block Builder</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  TX Queue &rarr; TX Pool &rarr; Nonce Filter &rarr; Engine API
                </p>
                <div className="mt-2 flex justify-center gap-3 text-xs">
                  <span className="rounded bg-secondary px-2 py-0.5">
                    Preconfirmations
                  </span>
                  <span className="rounded bg-secondary px-2 py-0.5">
                    WebSocket Events
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <div className="md:col-span-3 flex justify-center text-muted-foreground">
                <svg
                  width="24"
                  height="32"
                  viewBox="0 0 24 32"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 0v24m0 0l-6-6m6 6l6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Row 3: op-reth + Dashboard side by side */}
              <div className="md:col-span-2 rounded-lg border bg-card p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Blocks className="size-4 text-primary" />
                  <span className="font-semibold">op-reth</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Execution layer, block production
                </p>
              </div>

              <div className="rounded-lg border bg-card p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <LayoutDashboard className="size-4 text-primary" />
                  <span className="font-semibold">Dashboard</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Real-time metrics UI
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Start */}
      <section className="mx-auto max-w-7xl px-4 md:px-6 py-16 md:py-24">
        <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">
          Quick Start
        </h2>
        <div className="max-w-2xl mx-auto">
          <div className="rounded-lg border bg-[#0d1117] p-6 font-mono text-sm text-[#e6edf3]">
            <div className="text-[#8b949e] mb-2"># Start the stack</div>
            <div>
              <span className="text-[#79c0ff]">make</span> run-reth
            </div>
            <div className="mt-4 text-[#8b949e]"># Open the dashboard</div>
            <div>
              <span className="text-[#79c0ff]">open</span>{" "}
              http://localhost:18000/load-test/
            </div>
          </div>
          <div className="mt-6 text-center">
            <Button asChild>
              <Link href="/docs/getting-started">
                Read the full guide
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Component Cards */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-16 md:py-24">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">
            Components
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link href="/docs/block-builder" className="group">
              <Card className="h-full bg-card group-hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Blocks className="size-4 text-primary" />
                    Block Builder
                  </CardTitle>
                  <CardDescription>
                    External block building via Engine API. Transaction pool with
                    nonce management, preconfirmations, and configurable
                    ordering.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-sm text-primary group-hover:underline">
                    View docs &rarr;
                  </span>
                </CardContent>
              </Card>
            </Link>

            <Link href="/docs/load-generator" className="group">
              <Card className="h-full bg-card group-hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="size-4 text-primary" />
                    Load Generator
                  </CardTitle>
                  <CardDescription>
                    High-throughput TX sender with multiple transaction types,
                    load patterns, circuit breaker, and on-chain verification.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-sm text-primary group-hover:underline">
                    View docs &rarr;
                  </span>
                </CardContent>
              </Card>
            </Link>

            <Link href="/docs/mcp" className="group">
              <Card className="h-full bg-card group-hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bot className="size-4 text-primary" />
                    MCP Integration
                  </CardTitle>
                  <CardDescription>
                    24 AI tools for conversational stack management. Control the
                    block builder, load generator, and Docker stack from your AI
                    editor.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-sm text-primary group-hover:underline">
                    View docs &rarr;
                  </span>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
