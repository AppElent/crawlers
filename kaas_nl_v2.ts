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
}

run();
