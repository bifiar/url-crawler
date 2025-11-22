import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BatchService } from '../batch.service';
import { BatchEntity } from '../../entities/batch.entity';
import { PageEntity } from '../../entities/page.entity';
import { ContentCodecService } from '../../../common/services/content-codec.service';
import { Repository } from 'typeorm';

type MockedBatchRepository = jest.Mocked<
  Pick<
    Repository<BatchEntity>,
    'create' | 'save' | 'findOne' | 'update' | 'increment'
  >
>;
type MockedPageRepository = jest.Mocked<Pick<Repository<PageEntity>, 'find'>>;
type MockedContentCodecService = jest.Mocked<
  Pick<ContentCodecService, 'decompress'>
>;

describe('BatchService', () => {
  let service: BatchService;
  let batchRepo: MockedBatchRepository;
  let pageRepo: MockedPageRepository;

  beforeEach(async () => {
    batchRepo = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockResolvedValue({ id: '123' }),
      findOne: jest.fn(),
      update: jest.fn(),
      increment: jest.fn(),
    } as MockedBatchRepository;
    pageRepo = {
      find: jest.fn().mockResolvedValue([]),
    } as MockedPageRepository;
    const contentCodecService: MockedContentCodecService = {
      decompress: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchService,
        { provide: getRepositoryToken(BatchEntity), useValue: batchRepo },
        { provide: getRepositoryToken(PageEntity), useValue: pageRepo },
        { provide: ContentCodecService, useValue: contentCodecService },
      ],
    }).compile();

    service = module.get<BatchService>(BatchService);
  });

  it('should create a batch', async () => {
    const seedUrls = ['https://a.com'];
    const batch = await service.createBatch(seedUrls);
    expect(batchRepo.create).toHaveBeenCalledWith({ seedUrls });
    expect(batchRepo.save).toHaveBeenCalled();
    expect(batch.id).toBe('123');
  });

  it('should get batch with pages', async () => {
    batchRepo.findOne.mockResolvedValue({
      id: '123',
      status: 'pending',
      seedUrls: ['https://seed.com'],
    });

    const mockPage = {
      id: 'page-1',
      url: 'https://test.com',
      depth: 0,
      statusCode: 200,
      links: [],
      error: null,
      durationMs: 100,
    };
    pageRepo.find.mockResolvedValue([mockPage]);

    const result = await service.getBatchWithPages('123', false, 100, 0);

    expect(batchRepo.findOne).toHaveBeenCalledWith({ where: { id: '123' } });
    expect(result.batchId).toBe('123');
    expect(result.seedUrls).toEqual(['https://seed.com']);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].url).toBe('https://test.com');
  });
});
