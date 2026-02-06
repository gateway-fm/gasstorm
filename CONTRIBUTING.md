# Contributing to GasStorm

## Prerequisites

- Docker and Docker Compose
- Go 1.25+
- Node.js 18+ and npm
- `make`

## Repository Structure

GasStorm is a monorepo that orchestrates external components via Docker Compose:

```
gasstorm/                  # This repo - orchestration and dashboard
├── dashboard/             # Next.js UI for load testing
├── docs/                  # Architecture, configuration, troubleshooting
├── genesis/               # Chain genesis config and JWT secret
├── scripts/               # Helper scripts (start, test, bridge)
├── zisk-prover/           # ZisK zkVM prover (Go)
├── docker-compose.yml     # Main compose file (all profiles)
└── Makefile               # Developer commands

../blockbuilder/           # External: block-builder (Go)
../loadgenerator/          # External: load-generator (Go)
```

## Development Workflow

### Quick start

```bash
# Start infrastructure + pull latest images
make run-reth

# Development mode (local load-generator + dashboard with HMR)
make dev

# View logs
make logs

# Stop all services
make stop
```

### Local builds

To build from local sibling repos instead of pulling Docker images:

```bash
make run-build
```

This expects `../blockbuilder` and `../loadgenerator` directories.

## Running Tests

```bash
# Dashboard lint
make test

# API contract tests (no running stack needed)
make test-contract

# Smoke test (requires running stack)
make test-smoke

# Full E2E integration tests
make test-integration
```

For load-generator tests, see the [loadgenerator repo](https://github.com/gateway-fm/loadgenerator).

## Commit Conventions

- Use `--no-gpg-sign` to avoid GPG timeout issues:
  ```bash
  git commit --no-gpg-sign -m "feat: description"
  ```
- Follow conventional commit style: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- Keep commit messages concise and focused on the "why"

## Pull Request Process

1. Create a feature branch from `main`
2. Make changes and ensure tests pass
3. Push and open a PR with a clear description
4. Address review comments
5. Merge when approved

## Code Style

- **Go**: Idiomatic Go, explicit error handling, table-driven tests
- **TypeScript**: Strict mode, functional components, no `any`
- **JSON API**: All responses use camelCase field names
- **Max 300 lines per file**, max 50 lines per function
