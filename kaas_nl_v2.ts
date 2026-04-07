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
    // TODO: implement
}

run();
