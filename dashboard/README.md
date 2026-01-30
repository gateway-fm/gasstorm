# Dashboard

Next.js web UI for load testing the sequencer.

## Quick Start

```bash
# In development mode
npm run dev

# Open in browser
open http://localhost:18000
```

## Pages

### Load Test Page

`/load-test/`

Real-time load testing interface with:
- **Real-time chart**: MGas/s and TPS over time
- **Metrics snapshot**: Current, Peak, Total Gas Used
- **Latency histogram**: Confirmation and preconfirmation latencies
- **Percentile table**: p50/p75/p90/p95/p99 for latency, MGas/s, TPS
- **Verification summary**: TX sent/confirmed/failed counts

### Test History Page

`/load-test/history/`

Historical test results with:
- **Time series data**: MGas/s, TPS, block fill rate per sample
- **Summary stats**: Peak MGas/s, total gas used, average TPS
- **Latency percentiles**: Both confirmation and preconfirmation
- **Gas metrics per block**: gasUsed, gasLimit, fillRate

### Home Page

`/`

Landing page with navigation to load test interface.

## API Integration

The dashboard integrates with the Go load generator:

```typescript
// src/stores/go-load-test-store.ts
class GoLoadTestStore {
  async startTest(config: LoadTestConfig): Promise<void> {
    const response = await fetch('http://localhost:13001/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  }

  async stopTest(): Promise<void> {
    await fetch('http://localhost:13001/stop', { method: 'POST' });
  }

  async getStatus(): Promise<LoadTestStatus> {
    const response = await fetch('http://localhost:13001/status');
    return response.json();
  }

  async getHistory(): Promise<TestHistory[]> {
    const response = await fetch('http://localhost:13001/history');
    return response.json();
  }
}
```

## TypeScript Types

All API responses use camelCase. Types defined in:

| File | Purpose |
|------|---------|
| `src/types/load-test.ts` | Load test configuration and results |
| `src/types/metrics.ts` | Metrics and percentiles |
| `src/stores/metrics-store.ts` | Real-time metrics state |

### Core Types

```typescript
// Load test configuration
interface LoadTestConfig {
  pattern: 'constant' | 'burst' | 'poisson';
  constantRate?: number;
  durationSec: number;
  numAccounts?: number;
  transactionType?: string;
  txTypeRatios?: Record<string, number>;
}

// Load test status
interface LoadTestStatus {
  running: boolean;
  tps: number;
  mgasPerSec: number;
  totalTxs: number;
  confirmedTxs: number;
  failedTxs: number;
  avgLatencyMs: number;
}

// Test history summary
interface TestHistory {
  id: string;
  startTime: string;
  endTime: string;
  config: LoadTestConfig;
  summary: {
    peakTps: number;
    avgTps: number;
    peakMgasPerSec: number;
    totalGasUsed: number;
    totalTxs: number;
    successRate: number;
  };
  latencyPercentiles: {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  timeSeries: Array<{
    timestamp: string;
    tps: number;
    mgasPerSec: number;
  }>;
}
```

## Real-Time Updates

The dashboard polls for status updates:

```typescript
// Poll every second
setInterval(async () => {
  const status = await store.getStatus();
  metricsStore.update(status);
}, 1000);
```

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm run test
```

## Configuration

Dashboard configuration is in `next.config.ts`:

```typescript
// next.config.ts
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:13001/:path*',
      },
    ];
  },
};
```

## Styling

Uses Tailwind CSS with custom components. See `components.json` for configuration.

## Browser Automation

When testing the dashboard with automation:

1. **Window Size**: Resize to 1200x900 or larger
2. **Screenshots**: Capture full page for complete metrics
3. **Before Tests**: Clear localStorage to avoid stale state
4. **After Actions**: Wait 2-3 seconds for UI updates

See [Architecture](../docs/architecture.md) for system overview and [Configuration](../docs/configuration.md) for service ports.
