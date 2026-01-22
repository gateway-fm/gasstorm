# Current Focus

Architecture cleanup - split oversized files.

- [ ] **BlockBuilder God Object** - Extract from `block-builder/builder.go`:
  - `circuit_breaker.go` - circuit breaker logic
  - `metrics.go` - metrics collection
  - `stress_detector.go` - stress detection

- [ ] **builder.go exceeds 2300 lines** - Split into max 300-line modules:
  - `builder.go` - core BlockBuilder struct and main loop
  - `pipeline.go` - pipelined block production (already exists, verify separation)
  - `circuit_breaker.go` - circuit breaker (from above)
  - `stress.go` - stress detection
  - `metrics.go` - metrics

- [ ] **load-generator main.go exceeds 1999 lines** - Extract LoadGenerator struct to separate package
