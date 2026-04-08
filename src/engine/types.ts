import type { CheerioAPI } from 'cheerio';
import type { Page } from 'playwright';

interface BaseCrawlerConfig {
	startUrls: string[];
	listSelector: string; // CSS selector for detail links on LIST pages
	paginationSelector?: string; // shorthand: follow the href of this element
	fields: Record<string, string>; // fieldName → CSS selector (always textContent.trim())
	storeName: string; // KeyValueStore name
	datasetName: string; // Dataset name
	queueName?: string; // RequestQueue name (defaults to storeName + '-queue')
	outputFile: string; // JSON output filename, e.g. 'kaas_nl.json'
	maxRequestsPerCrawl?: number;
}

export interface PlaywrightCrawlerConfig extends BaseCrawlerConfig {
	extractDetail?: (page: Page) => Promise<Record<string, unknown>>;
	extractNextUrl?: (page: Page) => Promise<string | null>; // overrides paginationSelector
}

export interface CheerioCrawlerConfig extends BaseCrawlerConfig {
	extractDetail?: (
		$: CheerioAPI,
		url: string,
	) => Promise<Record<string, unknown>>;
	extractNextUrl?: ($: CheerioAPI) => Promise<string | null>; // overrides paginationSelector
}
