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
