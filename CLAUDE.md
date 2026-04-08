# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A collection of web crawlers built with [Crawlee](https://crawlee.dev/) and TypeScript. Each crawler is a standalone `.ts` file targeting a specific website.

## Commands

```bash
# Run a crawler
npx tsx src/kaas_nl.ts

# Lint (Biome)
npm run lint

# Lint + auto-fix
npm run lint:fix

# Type-check
npm run typecheck

# Lint + typecheck together
npm run check
```

## Architecture

Crawlers live in `src/`. The project uses ESM (`"type": "module"`), so all imports must use ESM syntax.

Two crawler patterns exist:

**v1 — `CheerioCrawler`** (`src/kaas_nl.ts`): Static HTML parsing. Faster, no JS execution. Use for sites that don't require a browser.

**v2 — `PlaywrightCrawler`** (`src/kaas_nl_v2.ts`): Full browser rendering. Use for JS-heavy or dynamically loaded pages.

Both follow the same two-phase pattern:
- `LIST` handler: collect detail page URLs, handle pagination
- `DETAIL` handler: extract product fields, push to `Dataset`

Incremental scraping: a named `KeyValueStore` persists a `seenUrls` array across runs. Check `isNew(url)` before enqueueing detail pages.

Crawlee local storage (datasets, key-value stores, request queues) is written to `./storage/`.

## Adding a New Crawler

Create `src/site_name.ts`:
1. Define `Label` type (`'LIST' | 'DETAIL'`) and a typed `Product` interface
2. Open a named `RequestQueue`, `KeyValueStore`, and `Dataset`
3. Load `seenUrls` from the store into a `Set<string>`
4. Build a crawler (Cheerio for static, Playwright for dynamic) with `LIST`/`DETAIL` handlers
5. Save `seen` back to the store at the end of the run
6. Call `dataset.exportToJSON()` to write results
