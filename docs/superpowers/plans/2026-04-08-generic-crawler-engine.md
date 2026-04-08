# Generic Crawler Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract crawler logic into a generic engine so each crawler is a single TypeScript file with an inline config that calls `runPlaywrightCrawler` or `runCheerioCrawler`.

**Architecture:** A shared engine in `src/engine/` handles all Crawlee boilerplate (queue, store, dataset, seenUrls lifecycle). Each crawler file defines its config inline and calls the appropriate engine function. Existing crawlers are moved unchanged to `src/archive/`.

**Tech Stack:** Crawlee 3.x, Playwright, TypeScript ESM, Biome (lint)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/engine/types.ts` | Create | `BaseCrawlerConfig`, `PlaywrightCrawlerConfig`, `CheerioCrawlerConfig` interfaces |
| `src/engine/playwright.ts` | Create | `runPlaywrightCrawler(config)` — full lifecycle for Playwright crawlers |
| `src/engine/cheerio.ts` | Create | `runCheerioCrawler(config)` — full lifecycle for Cheerio crawlers |
| `src/kaas_nl.ts` | Replace | Inline config + `runPlaywrightCrawler` call (v2 logic) |
| `src/archive/kaas_nl.ts` | Create (copy) | Original v1 Cheerio crawler, unchanged |
| `src/archive/kaas_nl_v2.ts` | Create (copy) | Original v2 Playwright crawler, unchanged |

---

## Task 1: Archive existing crawlers

**Files:**
- Create: `src/archive/kaas_nl.ts`
- Create: `src/archive/kaas_nl_v2.ts`

- [ ] **Step 1: Create the archive directory and copy both files**

```bash
mkdir -p src/archive
cp src/kaas_nl.ts src/archive/kaas_nl.ts
cp src/kaas_nl_v2.ts src/archive/kaas_nl_v2.ts
```

- [ ] **Step 2: Verify the copies exist and are identical to the originals**

```bash
diff src/kaas_nl.ts src/archive/kaas_nl.ts
diff src/kaas_nl_v2.ts src/archive/kaas_nl_v2.ts
```

Expected: no output (files are identical).

- [ ] **Step 3: Commit**

```bash
git add src/archive/
git commit -m "chore: archive original crawlers to src/archive"
```

---

## Task 2: Create `src/engine/types.ts`

**Files:**
- Create: `src/engine/types.ts`

- [ ] **Step 1: Create the engine directory and write `types.ts`**

```ts
// src/engine/types.ts
import type { CheerioAPI } from 'cheerio';
import type { Page } from 'playwright';

interface BaseCrawlerConfig {
    startUrls: string[];
    listSelector: string;        // CSS selector for detail links on LIST pages
    paginationSelector?: string; // shorthand: follow the href of this element
    fields: Record<string, string>; // fieldName → CSS selector (always textContent.trim())
    storeName: string;           // KeyValueStore name
    datasetName: string;         // Dataset name
    queueName?: string;          // RequestQueue name (defaults to storeName + '-queue')
    outputFile: string;          // JSON output filename, e.g. 'kaas_nl.json'
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

- [ ] **Step 2: Run typecheck to verify**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/types.ts
git commit -m "feat: add CrawlerConfig types"
```

---

## Task 3: Create `src/engine/playwright.ts`

**Files:**
- Create: `src/engine/playwright.ts`

- [ ] **Step 1: Write the Playwright engine**

```ts
// src/engine/playwright.ts
import {
    Dataset,
    KeyValueStore,
    PlaywrightCrawler,
    type PlaywrightCrawlingContext,
    RequestQueue,
} from 'crawlee';
import type { PlaywrightCrawlerConfig } from './types.ts';

export async function runPlaywrightCrawler(config: PlaywrightCrawlerConfig): Promise<void> {
    const queueName = config.queueName ?? `${config.storeName}-queue`;
    const requestQueue = await RequestQueue.open(queueName);
    const store = await KeyValueStore.open(config.storeName);
    const dataset = await Dataset.open(config.datasetName);

    const stored = (await store.getValue<string[]>('seenUrls')) ?? [];
    const seen = new Set<string>(stored);

    for (const url of config.startUrls) {
        await requestQueue.addRequest({ url, label: 'LIST' });
    }

    const crawler = new PlaywrightCrawler({
        requestQueue,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl,

        async requestHandler(ctx: PlaywrightCrawlingContext) {
            const { request, page, log } = ctx;
            const label = request.label as 'LIST' | 'DETAIL';

            if (label === 'LIST') {
                log.info(`LIST: ${request.url}`);
                await page.waitForSelector(config.listSelector);

                const detailUrls = await page.$$eval(config.listSelector, (els) =>
                    els.map((el) => (el as HTMLAnchorElement).href),
                );

                for (const url of detailUrls) {
                    await requestQueue.addRequest({ url, label: 'DETAIL' });
                }

                let nextUrl: string | null = null;
                if (config.extractNextUrl) {
                    nextUrl = await config.extractNextUrl(page);
                } else if (config.paginationSelector) {
                    nextUrl = await page
                        .$eval(config.paginationSelector, (el) => (el as HTMLAnchorElement).href)
                        .catch(() => null);
                }

                if (nextUrl) {
                    await requestQueue.addRequest({ url: nextUrl, label: 'LIST', uniqueKey: nextUrl });
                    log.info(`Enqueued next page: ${nextUrl}`);
                }
            }

            if (label === 'DETAIL') {
                const url = request.url;
                if (seen.has(url)) {
                    log.info(`SKIP: ${url}`);
                    return;
                }
                seen.add(url);
                log.info(`DETAIL: ${url}`);

                const record: Record<string, unknown> = { url };

                for (const [fieldName, selector] of Object.entries(config.fields)) {
                    record[fieldName] = await page
                        .$eval(selector, (el) => el.textContent?.trim() ?? '')
                        .catch(() => '');
                }

                if (config.extractDetail) {
                    const extra = await config.extractDetail(page);
                    Object.assign(record, extra);
                }

                await dataset.pushData(record);
                log.info(`Saved: ${url}`);
            }
        },
    });

    await crawler.run();
    await dataset.exportToJSON(config.outputFile);
    await store.setValue('seenUrls', Array.from(seen));
    console.log(`Done. Results written to ${config.outputFile}`);
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/playwright.ts
git commit -m "feat: add generic Playwright crawler engine"
```

---

## Task 4: Create `src/engine/cheerio.ts`

**Files:**
- Create: `src/engine/cheerio.ts`

- [ ] **Step 1: Write the Cheerio engine**

```ts
// src/engine/cheerio.ts
import {
    CheerioCrawler,
    type CheerioCrawlingContext,
    Dataset,
    KeyValueStore,
    RequestQueue,
} from 'crawlee';
import type { CheerioCrawlerConfig } from './types.ts';

export async function runCheerioCrawler(config: CheerioCrawlerConfig): Promise<void> {
    const queueName = config.queueName ?? `${config.storeName}-queue`;
    const requestQueue = await RequestQueue.open(queueName);
    const store = await KeyValueStore.open(config.storeName);
    const dataset = await Dataset.open(config.datasetName);

    const stored = (await store.getValue<string[]>('seenUrls')) ?? [];
    const seen = new Set<string>(stored);

    for (const url of config.startUrls) {
        await requestQueue.addRequest({ url, label: 'LIST' });
    }

    const crawler = new CheerioCrawler({
        requestQueue,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl,

        async requestHandler(ctx: CheerioCrawlingContext) {
            const { request, $, enqueueLinks, log } = ctx;
            const label = request.label as 'LIST' | 'DETAIL';

            if (label === 'LIST') {
                log.info(`LIST: ${request.url}`);

                await enqueueLinks({ selector: config.listSelector, label: 'DETAIL' });

                let nextUrl: string | null = null;
                if (config.extractNextUrl) {
                    nextUrl = await config.extractNextUrl($);
                } else if (config.paginationSelector) {
                    nextUrl = $(config.paginationSelector).attr('href') ?? null;
                }

                if (nextUrl) {
                    await requestQueue.addRequest({ url: nextUrl, label: 'LIST', uniqueKey: nextUrl });
                    log.info(`Enqueued next page: ${nextUrl}`);
                }
            }

            if (label === 'DETAIL') {
                const url = request.url;
                if (seen.has(url)) {
                    log.info(`SKIP: ${url}`);
                    return;
                }
                seen.add(url);
                log.info(`DETAIL: ${url}`);

                const record: Record<string, unknown> = { url };

                for (const [fieldName, selector] of Object.entries(config.fields)) {
                    record[fieldName] = $(selector).text().trim();
                }

                if (config.extractDetail) {
                    const extra = await config.extractDetail($, url);
                    Object.assign(record, extra);
                }

                await dataset.pushData(record);
                log.info(`Saved: ${url}`);
            }
        },
    });

    await crawler.run();
    await dataset.exportToJSON(config.outputFile);
    await store.setValue('seenUrls', Array.from(seen));
    console.log(`Done. Results written to ${config.outputFile}`);
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/cheerio.ts
git commit -m "feat: add generic Cheerio crawler engine"
```

---

## Task 5: Replace `src/kaas_nl.ts` with inline-config entry file

**Files:**
- Modify: `src/kaas_nl.ts`

> Note: This replaces the current content of `src/kaas_nl.ts` entirely. The original is already safely archived in `src/archive/kaas_nl.ts`.

- [ ] **Step 1: Replace `src/kaas_nl.ts` with the inline-config version**

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
        flavor: '.kazen_details-smaaktags',
        description: '.kazen_all-description',
    },
    storeName: 'kaas-nl-store',
    datasetName: 'kaas-nl-dataset',
    outputFile: 'kaas_nl.json',
});
```

- [ ] **Step 2: Run typecheck and lint**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/kaas_nl.ts
git commit -m "feat: rewrite kaas_nl as generic-engine entry file"
```

---

## Self-Review Notes

- All types defined in Task 2 are used consistently in Tasks 3, 4, and 5 — no name drift.
- `extractNextUrl` overrides `paginationSelector` in both engines (explicit priority).
- `seenUrls` key is consistent (`'seenUrls'`) between both engines and the archived originals.
- `queueName` default formula (`storeName + '-queue'`) is applied in both engines.
- No test framework exists in this project — verification is done via `npm run typecheck` and `npm run check` (Biome lint + tsc).
