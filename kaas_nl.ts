import { PlaywrightCrawler, Dataset, log } from 'crawlee';

type Label = 'LIST' | 'DETAIL';

interface Cheese {
    url: string;
    title: string;
}

const BASE_URL = 'https://www.kaas.nl';
const START_URL = `${BASE_URL}/kazen`;

// Kandidaat-selectors voor kaastitels op lijstpagina (WooCommerce patronen)
const TITLE_SELECTORS = [
    '.woocommerce-loop-product__title',
    'h2.product-title',
    '.product-title',
    '.cat-cheese .title',
    'h3.product-title',
    '.products .product h2',
    '.products .product h3',
    'ul.products li.product h2',
];

// Selector voor kaaslinks (detailpagina's)
const PRODUCT_LINK_SELECTORS = [
    '.products .product a.woocommerce-loop-product__link',
    '.products .product a[href*="/kazen/"]',
    '.cat-cheese a[href*="/kazen/"]',
    'a[href*="/kazen/"]',
];

async function run() {
    const dataset = await Dataset.open('kazen-dataset');
    const collected = new Map<string, string>(); // url -> title

    const crawler = new PlaywrightCrawler({
        // Gedraag als echte browser (geen 403)
        launchContext: {
            launchOptions: {
                headless: true,
            },
        },
        maxRequestsPerCrawl: 200,
        requestHandlerTimeoutSecs: 60,

        async requestHandler({ request, page, enqueueLinks, log: crawlerLog }) {
            const label = request.label as Label;

            if (label === 'LIST') {
                crawlerLog.info(`LIST: ${request.url}`);

                // Wacht tot producten geladen zijn
                await page.waitForLoadState('networkidle');

                // Zoek werkende title-selector
                let workingTitleSelector: string | null = null;
                for (const sel of TITLE_SELECTORS) {
                    const count = await page.locator(sel).count();
                    if (count > 0) {
                        workingTitleSelector = sel;
                        crawlerLog.info(`Titles gevonden met selector: "${sel}" (${count} stuks)`);
                        break;
                    }
                }

                if (!workingTitleSelector) {
                    // Debug: dump de page-structuur om selectors te vinden
                    crawlerLog.warning('Geen bekende title-selector gevonden, dump structuur...');
                    const html = await page.content();
                    const snippet = html.substring(0, 3000);
                    crawlerLog.info(`Page snippet:\n${snippet}`);
                } else {
                    // Haal titels en URLs op van de lijstpagina
                    const products = await page.evaluate((sel: string) => {
                        const items: Array<{ title: string; url: string }> = [];
                        document.querySelectorAll(sel).forEach((el) => {
                            const title = el.textContent?.trim() ?? '';
                            // Zoek dichtstbijzijnde link-element
                            const link =
                                el.closest('a') ??
                                el.closest('li')?.querySelector('a') ??
                                el.closest('.product')?.querySelector('a');
                            const url = link ? (link as HTMLAnchorElement).href : '';
                            if (title) items.push({ title, url });
                        });
                        return items;
                    }, workingTitleSelector);

                    for (const { title, url } of products) {
                        if (!collected.has(url)) {
                            collected.set(url, title);
                            crawlerLog.info(`  kaas: ${title}`);
                        }
                    }
                }

                // Paginering via FacetWP
                const nextPage = await page.locator('a.facetwp-page.active ~ a.facetwp-page').first();
                const nextPageNum = await nextPage.getAttribute('data-page').catch(() => null);

                if (nextPageNum) {
                    const nextUrl = `${BASE_URL}/kazen/?fwp_paged=${nextPageNum}`;
                    crawlerLog.info(`Volgende pagina: ${nextUrl}`);
                    await enqueueLinks({
                        urls: [nextUrl],
                        label: 'LIST',
                    });
                } else {
                    // Fallback: probeer "next" class
                    const nextBtn = page.locator('a.facetwp-page.next');
                    const nextNum = await nextBtn.getAttribute('data-page').catch(() => null);
                    if (nextNum) {
                        const nextUrl = `${BASE_URL}/kazen/?fwp_paged=${nextNum}`;
                        crawlerLog.info(`Volgende pagina (fallback): ${nextUrl}`);
                        await enqueueLinks({
                            urls: [nextUrl],
                            label: 'LIST',
                        });
                    }
                }
            }
        },
    });

    await crawler.run([{ url: START_URL, label: 'LIST' }]);

    // Sla alle kazen op als dataset
    const cheeses: Cheese[] = Array.from(collected.entries()).map(([url, title]) => ({
        url,
        title,
    }));

    await dataset.pushData(cheeses);
    await dataset.exportToJSON('kazen.json');

    console.log(`\n✅ Klaar! ${cheeses.length} kazen gevonden.`);
    cheeses.forEach((c, i) => console.log(`  ${i + 1}. ${c.title}`));
}

run();
