import { Test, TestingModule } from '@nestjs/testing';
import { CrawlerOrchestrator } from '../crawler-orchestrator.service';
import { CrawlerService } from '../crawler.service';
import { BatchService } from '../../../batch/services/batch.service';

type MockedCrawlerService = jest.Mocked<Pick<CrawlerService, 'startCrawl'>>;

describe('CrawlerOrchestrator', () => {
  let service: CrawlerOrchestrator;
  let crawlerService: MockedCrawlerService;

  beforeEach(async () => {
    crawlerService = {
      startCrawl: jest.fn().mockResolvedValue(undefined),
    } as MockedCrawlerService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrawlerOrchestrator,
        { provide: CrawlerService, useValue: crawlerService },
        { provide: BatchService, useValue: {} as BatchService },
      ],
    }).compile();

    service = module.get<CrawlerOrchestrator>(CrawlerOrchestrator);
  });

  it('should schedule a crawl', () => {
    service.scheduleCrawl('123', ['http://test.com']);
    expect(crawlerService.startCrawl).toHaveBeenCalledWith(
      '123',
      ['http://test.com'],
      undefined,
    );
  });
});
