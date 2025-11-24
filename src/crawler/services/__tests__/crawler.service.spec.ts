import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { CrawlerService } from '../crawler.service';
import { HttpFetchService, FetchResult } from '../http-fetch.service';
import { LinkParserService } from '../link-parser.service';
import { ContentCodecService } from '../../../common/services/content-codec.service';
import { BatchService } from '../../../batch/services/batch.service';
import { BatchEntity, BatchStatus } from '../../../batch/entities/batch.entity';
import { PageEntity } from '../../../batch/entities/page.entity';

type BatchServiceMock = {
  updateBatchStatus: jest.Mock<
    Promise<void>,
    Parameters<BatchService['updateBatchStatus']>
  >;
};

describe('CrawlerService', () => {
  let service: CrawlerService;
  let batchRepo: jest.Mocked<
    Pick<Repository<BatchEntity>, 'update' | 'increment'>
  >;
  let pageRepo: jest.Mocked<Pick<Repository<PageEntity>, 'save'>>;
  let httpFetchService: jest.Mocked<Pick<HttpFetchService, 'fetch'>>;
  let linkParserService: jest.Mocked<Pick<LinkParserService, 'extractLinks'>>;
  let batchService: BatchServiceMock;
  let setupCrawlerService: (
    overrides?: Record<string, unknown>,
  ) => Promise<void>;

  beforeEach(() => {
    setupCrawlerService = async (
      overrides: Record<string, unknown> = {},
    ): Promise<void> => {
      batchRepo = {
        update: jest.fn(),
        increment: jest.fn(),
      } as jest.Mocked<Pick<Repository<BatchEntity>, 'update' | 'increment'>>;
      pageRepo = {
        save: jest.fn(),
      } as jest.Mocked<Pick<Repository<PageEntity>, 'save'>>;
      httpFetchService = {
        fetch: jest.fn(),
      } as jest.Mocked<Pick<HttpFetchService, 'fetch'>>;
      linkParserService = {
        extractLinks: jest.fn().mockReturnValue([]),
      } as jest.Mocked<Pick<LinkParserService, 'extractLinks'>>;
      const batchServiceMock: BatchServiceMock = {
        updateBatchStatus: jest.fn<
          Promise<void>,
          Parameters<BatchService['updateBatchStatus']>
        >(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CrawlerService,
          { provide: getRepositoryToken(BatchEntity), useValue: batchRepo },
          { provide: getRepositoryToken(PageEntity), useValue: pageRepo },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(<T>(key: string, def: T) => {
                const override = overrides[key];
                if (override !== undefined) {
                  return override as T;
                }
                return def;
              }),
            },
          },
          { provide: HttpFetchService, useValue: httpFetchService },
          {
            provide: LinkParserService,
            useValue: linkParserService,
          },
          {
            provide: ContentCodecService,
            useValue: {
              compress: jest.fn().mockResolvedValue(Buffer.from('compressed')),
              calculateHash: jest.fn().mockReturnValue('mock-hash'),
            },
          },
          {
            provide: BatchService,
            useValue: batchServiceMock as unknown as BatchService,
          },
        ],
      }).compile();

      service = module.get<CrawlerService>(CrawlerService);
      batchService = batchServiceMock;
    };
  });

  beforeEach(async () => {
    await setupCrawlerService();
  });

  it('should crawl seed urls and save results', async () => {
    httpFetchService.fetch.mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: 'html',
      durationMs: 100,
      finalUrl: 'https://example.com',
    });

    await service.startCrawl('batch-id', ['https://example.com']);

    expect(batchService.updateBatchStatus).toHaveBeenCalledWith(
      'batch-id',
      BatchStatus.RUNNING,
    );
    expect(httpFetchService.fetch).toHaveBeenCalledWith('https://example.com');
    expect(pageRepo.save).toHaveBeenCalled();
    expect(batchService.updateBatchStatus).toHaveBeenCalledWith(
      'batch-id',
      BatchStatus.COMPLETED,
    );
  });

  it('should handle fetch errors', async () => {
    httpFetchService.fetch.mockRejectedValue(new Error('Network Error'));

    await service.startCrawl('batch-id', ['https://example.com']);

    expect(pageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Network Error' }),
    );
  });

  it('should crawl nested links respecting depth limit and avoid visited', async () => {
    const linkGraph: Record<string, string[]> = {
      'https://root.com': ['https://child.com', 'https://sibling.com'],
      'https://child.com': ['https://sibling.com', 'https://grandchild.com'],
      'https://sibling.com': ['https://root.com'],
      'https://grandchild.com': ['https://great-grandchild.com'],
    };

    const buildFetchResult = (url: string): FetchResult => ({
      statusCode: 200,
      headers: {},
      body: `<html>${url}</html>`,
      durationMs: 25,
      finalUrl: url,
    });

    httpFetchService.fetch.mockImplementation((url: string) =>
      Promise.resolve(buildFetchResult(url)),
    );

    linkParserService.extractLinks.mockImplementation(
      (_body: string, finalUrl: string) => linkGraph[finalUrl] ?? [],
    );

    await service.startCrawl('batch-depth', ['https://root.com'], 2);

    expect(httpFetchService.fetch).toHaveBeenCalledTimes(4);
    expect(pageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://root.com',
        depth: 0,
        links: linkGraph['https://root.com'],
      }),
    );
    expect(pageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://child.com',
        depth: 1,
        links: linkGraph['https://child.com'],
      }),
    );
    expect(pageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://grandchild.com',
        depth: 2,
      }),
    );
    expect(httpFetchService.fetch).not.toHaveBeenCalledWith(
      'https://great-grandchild.com',
    );
  });

  it('should stop crawling when reaching the max pages limit', async () => {
    await setupCrawlerService({ CRAWLER_MAX_PAGES: 2 });
    httpFetchService.fetch.mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: '<html></html>',
      durationMs: 10,
      finalUrl: 'http://example.com',
    });

    await service.startCrawl('limited-batch', [
      'https://one.com',
      'https://two.com',
      'https://three.com',
    ]);

    expect(httpFetchService.fetch).toHaveBeenCalledTimes(2);
    expect(pageRepo.save).toHaveBeenCalledTimes(2);
    expect(batchService.updateBatchStatus).toHaveBeenCalledWith(
      'limited-batch',
      BatchStatus.COMPLETED,
    );
  });

  it('should enforce global concurrency limit across batches', async () => {
    await setupCrawlerService({ CRAWLER_CONCURRENCY: 1 });
    const tracked = { inFlight: 0, peak: 0 };

    httpFetchService.fetch.mockImplementation(async (url: string) => {
      tracked.inFlight += 1;
      tracked.peak = Math.max(tracked.peak, tracked.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      tracked.inFlight -= 1;
      return {
        statusCode: 200,
        headers: {},
        body: `<html>${url}</html>`,
        durationMs: 10,
        finalUrl: url,
      };
    });

    await Promise.all([
      service.startCrawl('batch-a', ['https://one.com', 'https://two.com']),
      service.startCrawl('batch-b', ['https://three.com']),
    ]);

    expect(tracked.peak).toBeLessThanOrEqual(1);
  });
});
