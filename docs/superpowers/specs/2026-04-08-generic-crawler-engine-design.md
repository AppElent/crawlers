# Generic Crawler Engine — Design Spec

**Date:** 2026-04-08

## Goal

Replace hardcoded crawler files with a generic engine. Each crawler is a single TypeScript file that defines its config inline and calls the engine. Existing crawlers are preserved unchanged in `src/archive/`.

## Folder Structure

```
src/
  engine/
    types.ts          — CrawlerConfig interfaces + shared types
    cheerio.ts        — runCheerioCrawler(config)
    playwright.ts     — runPlaywrightCrawler(config)
  archive/
    kaas_nl.ts        — original CheerioCrawler (v1, unchanged)
    kaas_nl_v2.ts     — original PlaywrightCrawler (v2, unchanged)
  kaas_nl.ts          — config inline + engine call
```

## Config Interface

Defined in `src/engine/types.ts`. Two typed variants, one per engine type:

```ts
interface BaseCrawlerConfig {
  startUrls: string[];
  listSelector: string;            // CSS selector for detail links on LIST pages
  paginationSelector?: string;     // shorthand: follow the href of this element
  fields: Record<string, string>;  // fieldName → CSS selector (always textContent.trim())
  storeName: string;               // KeyValueStore name
  datasetName: string;             // Dataset name
  queueName?: string;              // RequestQueue name (defaults to storeName + '-queue')
  outputFile: string;              // JSON output filename
  maxRequestsPerCrawl?: number;
}

export interface PlaywrightCrawlerConfig extends BaseCrawlerConfig {
  extractDetail?: (page: Page) => Promise<Record<string, unknown>>;
  extractNextUrl?: (page: Page) => Promise<string | null>; // overrides paginationSelector
}

export interface CheerioCrawlerConfig extends BaseCrawlerConfig {
  extractDetail?: ($: CheerioAPI, url: string) => Promise<Record<string, unknown>>;
  extractNextUrl?: ($: CheerioAPI) => Promise<string | null>; // overrides paginationSelector
}
```

No `crawlerType` field — the choice is expressed by which engine function is called in the entry file.

## Entry File Pattern

Each crawler is a file in `src/` that defines its config inline and calls the engine:

```ts
// src/kaas_nl.ts
import { runPlaywrightCrawler } from './engine/playwright.ts';

runPlaywrightCrawler({
  startUrls: ['https://www.kaas.nl/kazen/'],
  listSelector: '.cat-cheese > a',
  extractNextUrl: async (page) => {
    const next = await page.$('a.facetwp-page.next');
    if (!next) return null;
    const dataPage = await next.getAttribute('data-page');
    return dataPage ? `https://www.kaas.nl/kazen/?fwp_paged=${dataPage}` : null;
  },
  fields: {
    title: 'h1.title',
    segment: 'h6.subtitle',
    description: '.kazen_all-description',
  },
  extractDetail: async (page) => ({
    intensity: await page.$$eval('.intensity-dot.active', (els) => els.length),
  }),
  storeName: 'kaas-nl-store',
  datasetName: 'kaas-nl-dataset',
  outputFile: 'kaas_nl.json',
});
```

Run command stays the same: `npx tsx src/kaas_nl.ts`

## Engine Behavior

Both engines follow the same lifecycle:

1. **Setup** — open RequestQueue (named `queueName ?? storeName + '-queue'`), KeyValueStore (`storeName`), Dataset (`datasetName`); load `seenUrls` from store into a `Set<string>`
2. **LIST handler**
   - Collect detail URLs via `listSelector`
   - Enqueue each detail URL with label `'DETAIL'`
   - Determine next page URL: call `extractNextUrl` if defined, otherwise check `paginationSelector` for an `href`. If a URL is returned, enqueue with label `'LIST'`
3. **DETAIL handler**
   - Skip if URL already in `seenUrls`; add to `seenUrls`
   - Extract each field in `fields` via `textContent.trim()` (Playwright) or `$(selector).text().trim()` (Cheerio)
   - If `extractDetail` is defined, call it and merge the result
   - Push merged record + `{ url }` to Dataset
4. **Teardown** — save `seenUrls` back to store; call `dataset.exportToJSON(outputFile)`

## Cheerio vs Playwright differences

| Concern | Cheerio engine | Playwright engine |
|---|---|---|
| Link collection (LIST) | `enqueueLinks({ selector, label })` | `page.$$eval(selector, ...)` + manual enqueue |
| Field extraction | `$(selector).text().trim()` | `page.$eval(selector, el => el.textContent?.trim() ?? '').catch(() => '')` |
| `extractDetail` ctx | `($, url)` | `(page)` |
| Pagination wait | none needed | `page.waitForSelector(listSelector)` before collecting |

## Archive

`src/kaas_nl.ts` (v1 Cheerio) and `src/kaas_nl_v2.ts` (v2 Playwright) are moved unchanged to `src/archive/`. They remain runnable as-is for reference.

The new `src/kaas_nl.ts` implements the v2 (Playwright) logic via the generic engine, as v2 is the more complete implementation.

## Out of Scope

- No changes to `package.json`, `tsconfig.json`, or `biome.json`
- No proxy configuration (already commented out in v2, can be added per-crawler if needed)
- No per-field attribute extraction or transforms (can be handled via `extractDetail`)
