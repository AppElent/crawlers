import {
    PlaywrightCrawler,
    Dataset,
    RequestQueue,
    KeyValueStore,
} from 'crawlee';

type Label = 'LIST' | 'DETAIL';

interface Product {
    url: string;
    title: string;
    price?: string;
    description?: string;
}

const BASE_URL = 'https://www.kaas.nl';
const START_URL = `${BASE_URL}/kazen`;

// Kandidaat-selectors voor kaaslinks op lijstpagina (WooCommerce patronen)
const LINK_SELECTORS = [
    '.cat-cheese a',
    '.products .product a.woocommerce-loop-product__link',
    '.products .product a[href*="/kazen/"]',
    'ul.products li.product a[href*="/kazen/"]',
];

async function run() {
    const requestQueue = await RequestQueue.open();
    const store = await KeyValueStore.open('kazen-store');

    // 👉 load eerdere URLs
    const stored = (await store.getValue<string[]>('seenUrls')) ?? [];
    const seen = new Set<string>(stored);

    // 👉 dataset voor nieuwe data
    const dataset = await Dataset.open('kazen-dataset');

    async function isNew(url: string): Promise<boolean> {
        if (seen.has(url)) return false;
        seen.add(url);
        return true;
    }

    // start URLs
    await requestQueue.addRequest({ url: START_URL, label: 'LIST' });

    const crawler = new PlaywrightCrawler({
        // Gedraag als echte browser (geen 403)
        requestQueue,
        launchContext: {
            launchOptions: {
                headless: true,
            },
        },
        maxRequestsPerCrawl: 200,
        requestHandlerTimeoutSecs: 60,

        async requestHandler({ request, page, enqueueLinks, log }) {
            const label = request.label as Label;

            if (label === 'LIST') {
                log.info(`LIST: ${request.url}`);

                // Wacht tot producten geladen zijn
                await page.waitForLoadState('networkidle');

                // Zoek werkende link-selector en enqueue detailpagina's
                let enqueued = false;
                for (const sel of LINK_SELECTORS) {
                    const count = await page.locator(sel).count();
                    if (count > 0) {
                        log.info(`Kaaslinks gevonden met selector: "${sel}" (${count} stuks)`);
                        await enqueueLinks({ selector: sel, label: 'DETAIL' });
                        enqueued = true;
                        break;
                    }
                }

                if (!enqueued) {
                    log.warning('Geen bekende link-selector gevonden, dump structuur...');
                    const html = await page.content();
                    log.info(`Page snippet:\n${html.substring(0, 3000)}`);
                }

                // Paginering via FacetWP
                const nextPage = await page.locator('a.facetwp-page.active ~ a.facetwp-page').first();
                const nextPageNum = await nextPage.getAttribute('data-page').catch(() => null);

                if (nextPageNum) {
                    const nextUrl = `${BASE_URL}/kazen/?fwp_paged=${nextPageNum}`;
                    log.info(`Volgende pagina: ${nextUrl}`);
                    await requestQueue.addRequest({ url: nextUrl, label: 'LIST', uniqueKey: nextUrl });
                } else {
                    // Fallback: probeer "next" class
                    const nextNum = await page.locator('a.facetwp-page.next')
                        .getAttribute('data-page')
                        .catch(() => null);
                    if (nextNum) {
                        const nextUrl = `${BASE_URL}/kazen/?fwp_paged=${nextNum}`;
                        log.info(`Volgende pagina (fallback): ${nextUrl}`);
                        await requestQueue.addRequest({ url: nextUrl, label: 'LIST', uniqueKey: nextUrl });
                    }
                }
            }

            if (label === 'DETAIL') {
                const url = request.url;

                // ❌ skip bestaande
                if (!(await isNew(url))) {
                    log.info(`SKIP: ${url}`);
                    return;
                }

                log.info(`NEW: ${url}`);

                await page.waitForLoadState('networkidle');

                const title = (await page.locator('h1').first().textContent())?.trim() ?? '';
                const price = (await page.locator('.price').first().textContent().catch(() => ''))?.trim() ?? '';
                const description = (await page.locator('.product-description').first().textContent().catch(() => ''))?.trim() ?? '';

                const product: Product = { url, title, price, description };
                await dataset.pushData(product);
            }
        },
    });

    await crawler.run();

    // 👇 alles naar 1 JSON file
    await dataset.exportToJSON('kazen.json');

    // 👉 save state
    await store.setValue('seenUrls', Array.from(seen));

    console.log('✅ Incremental scrape klaar!');
}

run();
