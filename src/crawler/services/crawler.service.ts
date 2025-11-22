import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import pLimit from 'p-limit';
import { BatchEntity, BatchStatus } from '../../batch/entities/batch.entity';
import { PageEntity } from '../../batch/entities/page.entity';
import { PageContentEntity } from '../../batch/entities/page-content.entity';
import { FetchResult, HttpFetchService } from './http-fetch.service';
import { LinkParserService } from './link-parser.service';
import { ContentCodecService } from '../../common/services/content-codec.service';
import { BatchService } from '../../batch/services/batch.service';

interface CrawlTask {
  url: string;
  depth: number;
}

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);
  private readonly concurrency: number;
  private readonly defaultMaxDepth: number;
  private readonly maxPagesPerBatch: number;
  // Global limiter shared across all batches to protect this specific pod/instance
  private readonly globalLimit: ReturnType<typeof pLimit>;

  constructor(
    @InjectRepository(PageEntity)
    private readonly pageRepo: Repository<PageEntity>,
    private readonly configService: ConfigService,
    private readonly httpFetchService: HttpFetchService,
    private readonly linkParserService: LinkParserService,
    private readonly codecService: ContentCodecService,
    private readonly batchService: BatchService,
  ) {
    this.concurrency = this.configService.get<number>(
      'CRAWLER_CONCURRENCY',
      50,
    );
    this.defaultMaxDepth = this.configService.get<number>(
      'CRAWLER_MAX_DEPTH',
      5,
    );
    this.maxPagesPerBatch = this.configService.get<number>(
      'CRAWLER_MAX_PAGES',
      1000,
    );

    this.globalLimit = pLimit(this.concurrency);
  }

  async startCrawl(
    batchId: string,
    seedUrls: string[],
    maxDepth?: number,
  ): Promise<void> {
    const depthLimit = maxDepth ?? this.defaultMaxDepth;
    const visited = new Set<string>();
    await this.batchService.updateBatchStatus(batchId, BatchStatus.RUNNING);

    const queue: CrawlTask[] = seedUrls.map((url) => ({ url, depth: 0 }));

    try {
      while (queue.length > 0) {
        if (visited.size >= this.maxPagesPerBatch) {
          this.logger.log(
            `Batch ${batchId} reached page limit of ${this.maxPagesPerBatch}.`,
          );
          break;
        }

        const remainingCapacity = this.maxPagesPerBatch - visited.size;
        const chunkSize = Math.min(
          this.concurrency,
          remainingCapacity,
          queue.length,
        );

        if (chunkSize <= 0) {
          break;
        }

        const chunk = queue.splice(0, chunkSize);
        const promises = chunk.map((task: CrawlTask) => {
          if (visited.has(task.url)) {
            return Promise.resolve([]);
          }
          visited.add(task.url);

          return this.processTask(batchId, task, depthLimit);
        });

        // Wait for the chunk to finish (Level-by-Level ish, but batched)
        // We use globalLimit to ensure we respect the global concurrency limit
        // if multiple batches run in parallel.
        const results = await Promise.all(
          promises.map((p) => this.globalLimit(() => p)),
        );

        for (const nextTasks of results) {
          for (const nextTask of nextTasks) {
            if (visited.has(nextTask.url)) {
              continue;
            }
            queue.push(nextTask);
          }
        }
      }

      await this.batchService.updateBatchStatus(batchId, BatchStatus.COMPLETED);
      this.logger.log(
        `Batch ${batchId} completed. Processed ${visited.size} pages.`,
      );
    } catch (error) {
      this.logger.error(`Fatal error in batch ${batchId}`, error);
      throw error;
    }
  }

  private async processTask(
    batchId: string,
    task: CrawlTask,
    depthLimit: number,
  ): Promise<CrawlTask[]> {
    const { url, depth } = task;

    try {
      const fetchResult = await this.httpFetchService.fetch(url);
      const { body, finalUrl } = fetchResult;
      const links = this.linkParserService.extractLinks(body, finalUrl);

      await this.savePageResult(
        batchId,
        { url, depth },
        fetchResult,
        null,
        links,
      );

      if (depth < depthLimit) {
        return links.map((link) => ({ url: link, depth: depth + 1 }));
      }
      return [];
    } catch (err) {
      this.logger.error(`Failed to process page ${task.url}`, err);
      await this.savePageResult(
        batchId,
        { url, depth },
        null,
        err instanceof Error ? err.message : 'Unknown error',
        [],
      );
      return [];
    }
  }

  private async savePageResult(
    batchId: string,
    task: CrawlTask,
    fetchResult: FetchResult | null,
    error: string | null,
    links: string[],
  ) {
    const page = new PageEntity();
    page.batch = { id: batchId } as BatchEntity;
    page.url = task.url;
    page.depth = task.depth;
    page.links = links;
    page.error = error;

    if (fetchResult) {
      page.statusCode = fetchResult.statusCode;
      page.durationMs = fetchResult.durationMs;
      page.hasContent = !!fetchResult.body;
    }

    if (fetchResult?.body) {
      const content = new PageContentEntity();
      content.originalSize = Buffer.byteLength(fetchResult.body);
      content.compressedContent = await this.codecService.compress(
        fetchResult.body,
      );
      content.compressedSize = content.compressedContent.length;
      content.contentHash = this.codecService.calculateHash(fetchResult.body);
      page.content = content;
    }

    try {
      await this.pageRepo.save(page);
    } catch (e) {
      this.logger.error(`Failed to persist page ${task.url}`, e);
    }
  }
}
