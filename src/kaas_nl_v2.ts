import {
    Dataset,
    KeyValueStore,
    PlaywrightCrawler,
    type PlaywrightCrawlingContext,
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
    const _dataset = await Dataset.open<Product>('kaas-nl-v2-dataset');

    const stored = (await store.getValue<string[]>('seenUrls')) ?? [];
    const seen = new Set<string>(stored);

    async function _isNew(url: string): Promise<boolean> {
        if (seen.has(url)) return false;
        seen.add(url);
        return true;
    }

    await requestQueue.addRequest({ url: START_URL, label: 'LIST' });

    // const proxyConfiguration = new ProxyConfiguration({ proxyUrls: ['http://...'] });

    const _crawler = new PlaywrightCrawler({
        requestQueue,

        async requestHandler(ctx: PlaywrightCrawlingContext) {
            const { request, page, log } = ctx;
            const label = request.label as Label;

            if (label === 'LIST') {
                log.info(`LIST: ${request.url}`);

                await page.waitForSelector('.cat-cheese');

                // Collect all detail URLs from this page
                const detailUrls = await page.$$eval('.cat-cheese > a', (els) =>
                    els.map((el) => (el as HTMLAnchorElement).href),
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

            if (label === 'DETAIL') {
                const url = request.url;

                if (!(await _isNew(url))) {
                    log.info(`SKIP: ${url}`);
                    return;
                }

                log.info(`DETAIL: ${url}`);

                const [title, segment, flavor, description] = await Promise.all(
                    [
                        page
                            .$eval(
                                'h1.title',
                                (el) => el.textContent?.trim() ?? '',
                            )
                            .catch(() => ''),
                        page
                            .$eval(
                                'h6.subtitle',
                                (el) => el.textContent?.trim() ?? '',
                            )
                            .catch(() => ''),
                        page
                            .$eval(
                                '.kazen_details-smaaktags',
                                (el) => el.textContent?.trim() ?? '',
                            )
                            .catch(() => ''),
                        page
                            .$eval(
                                '.kazen_all-description',
                                (el) => el.textContent?.trim() ?? '',
                            )
                            .catch(() => ''),
                    ],
                );

                const product: Product = {
                    url,
                    title,
                    segment,
                    flavor,
                    description,
                };
                await _dataset.pushData(product);
                log.info(`Saved: ${title}`);
            }
        },
    });

    await _crawler.run();

    await _dataset.exportToJSON('kaas_nl_v2.json');
    await store.setValue('seenUrls', Array.from(seen));

    console.log('Done. Results written to kaas_nl_v2.json');
}

run();
