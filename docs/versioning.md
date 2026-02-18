# Docs Versioning

Developer-facing guide for the GasStorm docs versioning system.

## How It Works

### Data Model

`site/src/lib/versions.ts` is the single source of truth:

```typescript
export interface DocsVersion {
  version: string;          // "0.1.0"
  label: string;            // "v0.1 (latest)"
  basePath: string | null;  // null = current root, "/v/0.1" = archived
  isLatest: boolean;
  gitRef: string;           // "main" or "docs-v0.1"
}
```

- `basePath: null` means the version is served from the site root
- `basePath: "/v/0.1"` means it's an archived snapshot at that path
- `isLatest: true` marks the current version (exactly one entry should have this)

### Version Selector Component

`site/src/components/layout/version-selector.tsx` is adaptive:

- **Single version**: renders a static `Badge` showing `v0.1.0`
- **Multiple versions**: renders a dropdown button listing all versions with links

The component checks `hasMultipleVersions` (derived from `versions.length > 1`) to decide which mode to render.

### URL Scheme

| Version | URL |
|---------|-----|
| Latest (0.1) | `/gasstorm/docs/getting-started/` |
| Archived (0.1) | `/gasstorm/v/0.1/docs/getting-started/` |

Archived versions are full static builds deployed to subdirectories under `/v/<major>.<minor>/`.

## Current State

- Single version badge (`v0.1.0`) in header and mobile nav
- `DOCS_BASE_PATH` env var support in `next.config.ts`
- Multi-version dropdown activates automatically when `versions.ts` has 2+ entries

## How to Activate Multi-Version

1. Tag the current docs: `git tag docs-v0.1`
2. Update `site/src/lib/versions.ts`:
   ```typescript
   export const versions: DocsVersion[] = [
     {
       version: "0.2.0",
       label: "v0.2 (latest)",
       basePath: null,
       isLatest: true,
       gitRef: "main",
     },
     {
       version: "0.1.0",
       label: "v0.1",
       basePath: "/v/0.1",
       isLatest: false,
       gitRef: "docs-v0.1",
     },
   ];
   ```
3. Update CI to build archived versions:
   - Check out `docs-v0.1` tag
   - Build with `DOCS_BASE_PATH=/gasstorm/v/0.1`
   - Deploy output to the `/v/0.1/` subdirectory
4. The version selector automatically becomes a dropdown

## How to Port to Another Docs Site

Copy these 4 files:

1. `site/src/lib/versions.ts` — update version numbers
2. `site/src/components/layout/version-selector.tsx` — no changes needed
3. Header integration — add `<VersionSelector />` to your site header
4. Mobile nav integration — add `<MobileVersionBadge />` to mobile nav

Then update `next.config.ts` to use `DOCS_BASE_PATH`:

```typescript
basePath: process.env.DOCS_BASE_PATH || (isDev ? "" : "/your-site"),
```

## Architecture Decisions

- **Directory-based archiving** (not query params or JS routing) because GitHub Pages serves static files and search engines index each version independently
- **`basePath` env var** so the same codebase builds for root or subdirectory deployment without code changes
- **Custom dropdown vs Radix** to avoid adding a dependency for a component that's static 99% of the time — the dropdown only activates when there are multiple versions
