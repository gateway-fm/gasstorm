# Sequencer PoC - Development Guidelines

## Browser Automation

When using Chrome browser automation for testing the dashboard:

1. **Window Size**: Resize to 1200x900 or larger for full page screenshots
2. **Screenshots**: Always capture full page to see all UI elements and metrics
3. **Before Tests**: Clear localStorage to avoid stale state issues
4. **After Actions**: Wait 2-3 seconds before taking screenshots to allow UI updates

## Project Structure

- `block-builder/` - Go service for L2 block production via Engine API
- `dashboard/` - Next.js dashboard with load testing UI
- `load-generator/` - Go service for generating test transactions
- `genesis/` - Genesis configuration for op-reth
- `config/` - Configuration files for AggLayer integration

## Running Tests

```bash
# Start all services
docker compose up -d

# Run load test via dashboard
# Navigate to http://localhost:18000/load-test/

# View logs
docker compose logs -f block-builder
```

## Known Issues

- BigInt serialization: Fixed by custom storage handlers in Zustand stores
- ERC20 deployment timeout in Stress mode: Contracts deployed by Go load generator
