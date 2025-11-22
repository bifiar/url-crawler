import { Test, TestingModule } from '@nestjs/testing';
import { BatchController } from '../batch.controller';
import { BatchService } from '../services/batch.service';
import { CrawlerOrchestrator } from '../../crawler/services/crawler-orchestrator.service';

type MockedBatchService = jest.Mocked<
  Pick<BatchService, 'createBatch' | 'getBatchWithPages'>
>;
type MockedCrawlerOrchestrator = jest.Mocked<
  Pick<CrawlerOrchestrator, 'scheduleCrawl'>
>;

describe('BatchController', () => {
  let controller: BatchController;
  let batchService: MockedBatchService;
  let crawlerOrchestrator: MockedCrawlerOrchestrator;

  beforeEach(async () => {
    batchService = {
      createBatch: jest.fn().mockResolvedValue({ id: '123' }),
      getBatchWithPages: jest
        .fn()
        .mockResolvedValue({ batchId: '123', pages: [] }),
    } as MockedBatchService;
    crawlerOrchestrator = {
      scheduleCrawl: jest.fn(),
    } as MockedCrawlerOrchestrator;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BatchController],
      providers: [
        { provide: BatchService, useValue: batchService },
        { provide: CrawlerOrchestrator, useValue: crawlerOrchestrator },
      ],
    }).compile();

    controller = module.get<BatchController>(BatchController);
  });

  it('should submit fetch request', async () => {
    const dto = { urls: ['https://test.com'], maxDepth: 2 };
    const result = await controller.submitFetch(dto);

    expect(batchService.createBatch).toHaveBeenCalledWith(dto.urls);
    expect(crawlerOrchestrator.scheduleCrawl).toHaveBeenCalledWith(
      '123',
      dto.urls,
      dto.maxDepth,
    );
    expect(result).toEqual({ batchId: '123' });
  });

  it('should get batch results', async () => {
    const result = await controller.getBatch('123', 100, 0, false);
    expect(batchService.getBatchWithPages).toHaveBeenCalledWith(
      '123',
      false,
      100,
      0,
    );
    expect(result.batchId).toBe('123');
  });
});
