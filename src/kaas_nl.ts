// src/kaas_nl.ts
import { runPlaywrightCrawler } from './engine/playwright.ts';

runPlaywrightCrawler({
    startUrls: ['https://www.kaas.nl/kazen/'],
    listSelector: '.cat-cheese > a',
    extractNextUrl: async (page) => {
        const next = await page.$('a.facetwp-page.next');
        if (!next) return null;
        const dataPage = await next.getAttribute('data-page');
        return dataPage
            ? `https://www.kaas.nl/kazen/?fwp_paged=${dataPage}`
            : null;
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
