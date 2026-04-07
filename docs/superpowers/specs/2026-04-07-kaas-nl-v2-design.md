# kaas_nl_v2.ts — Design Spec

**Date:** 2026-04-07  
**Status:** Approved

## Overview

A rewrite of `kaas_nl.ts` that fixes three logic bugs, uses real CSS selectors discovered by inspecting the live site, and switches to `PlaywrightCrawler` to handle FacetWP's JavaScript-driven pagination. The new file is `kaas_nl_v2.ts` at the project root. The original `kaas_nl.ts` is not modified.

## Bugs Fixed

| Bug | Original | Fix |
|-----|----------|-----|
| `KeyValueStore` key mismatch | reads `seenUrls`, writes `seenUrls.json` | read and write use `seenUrls` |
| Pagination always-truthy | `if (nextPage)` on jQuery object | read `data-page` attribute, check if truthy string |
| Wrong pagination URL | `${nextPage}` stringifies jQuery object | `?fwp_paged=${dataPage}` with actual attribute value |
| Placeholder list selector | `.cat-cheese a` | `.cat-cheese > a` (direct child only) |

## Crawler Type

`PlaywrightCrawler` (from `crawlee/playwright`). Required because FacetWP pagination is JavaScript-driven — navigating to `?fwp_paged=N` URLs only renders the correct page content after FacetWP's JS initialises on load. `CheerioCrawler` would see the first-page content on every paginated URL.

## Data Model

```ts
type Label = 'LIST' | 'DETAIL';

interface Product {
  url: string;
  title: string;       // h1.title
  segment: string;     // h6.subtitle  (e.g. "Geitenkaas")
  flavor: string;      // .kazen_details-smaaktags  (e.g. "Mild")
  description: string; // .kazen_all-description
}
```

No price field — kaas.nl is an editorial catalogue, not a shop.

## Architecture

Two-phase crawl (same as v1):

```
startUrl: https://www.kaas.nl/kazen
    │
    ▼  label: LIST
┌─────────────────────────────────────────────┐
│ Wait for .cat-cheese                        │
│ Collect all .cat-cheese > a hrefs           │
│ Enqueue each as DETAIL                      │
│ Find a.facetwp-page.next[data-page]         │
│ If found → enqueue ?fwp_paged={N} as LIST   │
└─────────────────────────────────────────────┘
    │
    ▼  label: DETAIL (per cheese URL)
┌─────────────────────────────────────────────┐
│ isNew(url)? skip if seen                    │
│ Extract: title, segment, flavor, description│
│ Push to Dataset                             │
└─────────────────────────────────────────────┘
```

## Selectors

### LIST page (`/kazen/`, `/kazen/?fwp_paged=N`)

| Purpose | Selector |
|---------|----------|
| Product cards | `.cat-cheese` |
| Detail link | `.cat-cheese > a` (direct child `<a>`) |
| Next-page button | `a.facetwp-page.next` |
| Next-page number | `el.dataset.page` on the above |
| Next-page URL | `https://www.kaas.nl/kazen/?fwp_paged={N}` |

### DETAIL page (`/kazen/{slug}/`)

| Field | Selector |
|-------|----------|
| `title` | `h1.title` |
| `segment` | `h6.subtitle` |
| `flavor` | `.kazen_details-smaaktags` |
| `description` | `.kazen_all-description` |

All four extracted in parallel via `Promise.all`. Each selector is wrapped in an individual catch returning `''` to avoid one missing element aborting the whole page.

## State & Output

- **KeyValueStore**: named `kaas-nl-v2-store`, key `seenUrls` (consistent on read and write)
- **Dataset**: named `kaas-nl-v2-dataset`
- **Export**: `dataset.exportToJSON('kaas_nl_v2.json')` after `crawler.run()` completes
- **`maxRequestsPerCrawl`**: removed (v1's cap of 100 would cut the 660-cheese crawl short)

## Proxy Configuration

Scaffolded but commented out. Uncomment and supply URLs to activate:

```ts
// const proxyConfiguration = new ProxyConfiguration({ proxyUrls: ['http://...'] });
// Pass as: new PlaywrightCrawler({ proxyConfiguration, ... })
```

## Files

| Action | Path |
|--------|------|
| Create | `kaas_nl_v2.ts` |
| No change | `kaas_nl.ts` |
