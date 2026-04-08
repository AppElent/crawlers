import {
    CheerioCrawler,
    type CheerioCrawlingContext,
    Dataset,
    KeyValueStore,
    RequestQueue,
} from 'crawlee';

type Label = 'LIST' | 'DETAIL';

interface Product {
    url: string;
    title: string;
    price?: string;
    description?: string;
}

const startUrls: string[] = ['https://www.kaas.nl/kazen'];

async function run() {
    const requestQueue = await RequestQueue.open();
    const store = await KeyValueStore.open('kazen-store');

    // 👉 load eerdere URLs
    const stored = (await store.getValue<string[]>('seenUrls')) || [];
    const seen = new Set<string>(stored);

    // 👉 dataset voor nieuwe data
    const dataset = await Dataset.open('kazen-dataset');

    async function isNew(url: string): Promise<boolean> {
        if (seen.has(url)) return false;
        seen.add(url);
        return true;
    }

    // start URLs
    for (const url of startUrls) {
        await requestQueue.addRequest({
            url,
            label: 'LIST' as Label,
        });
    }

    const crawler = new CheerioCrawler({
        requestQueue,
        maxRequestsPerCrawl: 100,

        async requestHandler(ctx: CheerioCrawlingContext) {
            const { request, $, enqueueLinks, log } = ctx;
            const label = request.label as Label;

            if (label === 'LIST') {
                log.info(`LIST: ${request.url}`);

                // 🔗 detailpagina’s
                await enqueueLinks({
                    selector: '.cat-cheese a', // 👈 aanpassen
                    label: 'DETAIL',
                });

                const nextPage = $('a.facetwp-page.next[data-page]');
                console.log(nextPage.attr('data-page'));
                if (nextPage) {
                    const nextUrl = `https://www.kaas.nl/kazen/?fwp_paged=${nextPage}`;

                    log.info(`Volgende pagina: ${nextUrl}`);

                    await requestQueue.addRequest({
                        url: nextUrl,
                        label: 'LIST',
                        uniqueKey: nextUrl, // 👈 voorkomt duplicates
                    });
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

                const title = $('h1').text().trim();
                const price = $('.price').text().trim();
                const description = $('.product-description').text().trim();

                const product: Product = {
                    url,
                    title,
                    price,
                    description,
                };

                await dataset.pushData(product);
            }
        },
    });

    await crawler.run();

    // 👇 alles naar 1 JSON file
    await dataset.exportToJSON('kazen.json');

    // 👉 save state
    await store.setValue('seenUrls.json', Array.from(seen));

    console.log('✅ Incremental scrape klaar!');
}

run();
