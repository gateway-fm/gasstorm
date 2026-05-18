# Product

## Register

product

## Users

Blockchain infrastructure engineers at Gateway FM and partner teams who build, tune, and stress-test EVM sequencers. They iterate on op-reth, cdk-erigon, gravity-reth, and the block-builder, running GasStorm locally or on a remote rig to measure throughput, latency, and gas behaviour. They use this tool alongside profiling/logs while they change parameters, restart the stack, and compare runs.

## Product Purpose

GasStorm spins up a full L1/L2 stack plus a load generator so engineers can produce, measure, and verify high-TPS workloads. Success looks like: clear and trustworthy throughput/latency/gas readings, fast iteration between configuration changes, and obvious diagnosis of where a run is constrained (builder CPU, engine sync, mempool, etc.).

## Brand Personality

Terminal-native builder tool. The `>_` cursor logo, JetBrains Mono headings and numeric readouts, Inter for body, Gateway purple (`#8950FA`) for primary, light theme with a subtle dot grid. Confident, dense, instrument-grade. Three words: precise, fast, no-nonsense.

## Anti-references

- Stripe/Linear-style consumer-friendly marketing pages with hero illustrations and warm gradients
- Crypto neon-on-black "trader" aesthetics — green/red glow, big OHLC tickers, drama
- Default Datadog/Grafana dashboards with endless identical-sized chart tiles repeating across the page
- Marketing-grade hero-metric templates with gradient text and decorative SaaS cards

## Design Principles

- **Show real data fast.** When a test is running, the important numbers live above the fold. Idle states stay quiet rather than filling space with placeholder dashes.
- **Density without nesting.** Information should be dense, but tiles do not live inside other tiles. No card-in-card.
- **One mono voice.** Headings, labels, and numeric readouts use JetBrains Mono. Body copy may use Inter. The page reads like an instrument, not a marketing site.
- **Progressive reveal.** Idle = configure and start. Running = live readouts. Completed = full analysis. Don't render every section in every state.
- **Tuned for comparison.** Engineers run many tests back-to-back. Layout should help them compare runs, not impress them with one.

## Accessibility & Inclusion

- WCAG AA contrast for all numeric readouts (Gateway purple, status colors).
- State is communicated by label (Idle / Running / Verifying / Completed / Error) in addition to color, never by color alone.
- Numeric data is monospace at a minimum of 12px for any value the operator scans during a run.
