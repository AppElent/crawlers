import {
    PlaywrightCrawler,
    type PlaywrightCrawlingContext,
    Dataset,
    KeyValueStore,
    RequestQueue,
    // ProxyConfiguration,  // uncomment to enable proxy rotation
} from 'crawlee';

type Label = 'LIST' | 'DETAIL';

interface Product {
    url: string;
    title: string;
    segment: string;
    flavor: string;
    description: string;
}

const START_URL = 'https://www.kaas.nl/kazen/';

async function run() {
    const requestQueue = await RequestQueue.open('kaas-nl-v2-queue');
    const store = await KeyValueStore.open('kaas-nl-v2-store');
    const dataset = await Dataset.open<Product>('kaas-nl-v2-dataset');

    const stored = (await store.getValue<string[]>('seenUrls')) ?? [];
    const seen = new Set<string>(stored);

    async function isNew(url: string): Promise<boolean> {
        if (seen.has(url)) return false;
        seen.add(url);
        return true;
    }

    await requestQueue.addRequest({ url: START_URL, label: 'LIST' });

    // const proxyConfiguration = new ProxyConfiguration({ proxyUrls: ['http://...'] });

    const crawler = new PlaywrightCrawler({
        requestQueue,

        async requestHandler(ctx: PlaywrightCrawlingContext) {
            const { request, page, log } = ctx;
            const label = request.label as Label;

            if (label === 'LIST') {
                log.info(`LIST: ${request.url}`);

                await page.waitForSelector('.cat-cheese');

                // Collect all detail URLs from this page
                const detailUrls = await page.$$eval(
                    '.cat-cheese > a',
                    (els) => els.map((el) => (el as HTMLAnchorElement).href),
                );

                for (const url of detailUrls) {
                    await requestQueue.addRequest({ url, label: 'DETAIL' });
                }

                log.info(`Enqueued ${detailUrls.length} detail URLs`);

                // Enqueue next page if pagination button exists
                const nextPage = await page.$('a.facetwp-page.next');
                if (nextPage) {
                    const dataPage = await nextPage.getAttribute('data-page');
                    if (dataPage) {
                        const nextUrl = `https://www.kaas.nl/kazen/?fwp_paged=${dataPage}`;
                        await requestQueue.addRequest({
                            url: nextUrl,
                            label: 'LIST',
                            uniqueKey: nextUrl,
                        });
                        log.info(`Enqueued next page: ${nextUrl}`);
                    }
                }
            }
        },
    });
}

run();
