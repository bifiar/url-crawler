import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatchEntity, BatchStatus } from '../entities/batch.entity';
import { PageEntity } from '../entities/page.entity';
import { BatchResultDto } from '../dto/batch-result.dto';
import { PageResultDto } from '../dto/page-result.dto';
import { ContentCodecService } from '../../common/services/content-codec.service';

@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);

  constructor(
    @InjectRepository(BatchEntity)
    private readonly batchRepo: Repository<BatchEntity>,
    @InjectRepository(PageEntity)
    private readonly pageRepo: Repository<PageEntity>,
    private readonly codecService: ContentCodecService,
  ) {}

  async createBatch(seedUrls: string[]): Promise<BatchEntity> {
    const batch = this.batchRepo.create({
      seedUrls,
    });
    return this.batchRepo.save(batch);
  }

  async updateBatchStatus(
    id: string,
    status: BatchStatus,
    error?: string,
  ): Promise<void> {
    await this.batchRepo.update(id, {
      status,
      error,
      ...(status === BatchStatus.COMPLETED || status === BatchStatus.FAILED
        ? { completedAt: new Date() }
        : {}),
    });
  }

  async getBatchWithPages(
    id: string,
    includeContent: boolean,
    limit: number,
    offset: number,
  ): Promise<BatchResultDto> {
    const batch = await this.batchRepo.findOne({ where: { id } });
    if (!batch) {
      throw new NotFoundException(`Batch with ID ${id} not found`);
    }

    const pages = await this.pageRepo.find({
      where: { batch: { id } },
      relations: includeContent ? ['content'] : [],
      skip: offset,
      take: limit,
      order: { depth: 'ASC', createdAt: 'ASC' },
    });

    const pageDtos: PageResultDto[] = [];
    for (const page of pages) {
      let contentStr: string | null = null;
      let error = page.error;
      if (includeContent && page.content?.compressedContent) {
        try {
          contentStr = await this.codecService.decompress(
            page.content.compressedContent,
          );
        } catch (e) {
          this.logger.error(
            `Failed to decompress content for page ${page.id}`,
            e,
          );
          if (!error) {
            error = 'Failed to decompress content';
          }
        }
      }

      pageDtos.push({
        id: page.id,
        url: page.url,
        depth: page.depth,
        statusCode: page.statusCode,
        links: page.links,
        error: error,
        durationMs: page.durationMs,
        content: contentStr,
      });
    }

    return {
      batchId: batch.id,
      status: batch.status,
      createdAt: batch.createdAt,
      completedAt: batch.completedAt,
      error: batch.error,
      seedUrls: batch.seedUrls,
      pages: pageDtos,
    };
  }
}
