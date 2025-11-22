import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { BatchService } from '../../batch/services/batch.service';
import { BatchStatus } from '../../batch/entities/batch.entity';

@Injectable()
export class CrawlerOrchestrator implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrawlerOrchestrator.name);
  private readonly activeCrawls = new Map<string, Promise<void>>();

  constructor(
    private readonly crawlerService: CrawlerService,
    private readonly batchService: BatchService,
  ) {}

  onModuleInit() {
    this.logger.log('Crawler Orchestrator initialized');
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down Crawler Orchestrator...');
    const pending = Array.from(this.activeCrawls.values());
    if (pending.length > 0) {
      this.logger.log(`Waiting for ${pending.length} crawls to finish...`);
      await Promise.allSettled(pending);
    }
  }

  scheduleCrawl(batchId: string, urls: string[], maxDepth?: number) {
    this.logger.log(`Scheduling crawl for batch ${batchId}`);

    // Fire and forget, but track promise
    const crawlPromise = this.crawlerService
      .startCrawl(batchId, urls, maxDepth)
      .catch((err) => {
        this.logger.error(`Fatal error in crawl for batch ${batchId}`, err);
        // Mark batch as FAILED if unexpected error occurs
        this.batchService
          .updateBatchStatus(
            batchId,
            BatchStatus.FAILED,
            err instanceof Error ? err.message : 'Unknown error',
          )
          .catch((updateErr) => {
            this.logger.error(
              `Failed to update batch status to FAILED for ${batchId}`,
              updateErr,
            );
          });
      })
      .finally(() => {
        this.activeCrawls.delete(batchId);
      });

    this.activeCrawls.set(batchId, crawlPromise);
  }
}
