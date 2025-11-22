import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { BatchService } from './services/batch.service';
import { CrawlerOrchestrator } from '../crawler/services/crawler-orchestrator.service';
import { SubmitFetchDto } from './dto/submit-fetch.dto';
import { BatchResultDto } from './dto/batch-result.dto';

@Controller('fetch')
export class BatchController {
  constructor(
    private readonly batchService: BatchService,
    private readonly crawlerOrchestrator: CrawlerOrchestrator,
  ) {}

  @Post()
  async submitFetch(
    @Body() submitFetchDto: SubmitFetchDto,
  ): Promise<{ batchId: string }> {
    const batch = await this.batchService.createBatch(submitFetchDto.urls);

    this.crawlerOrchestrator.scheduleCrawl(
      batch.id,
      submitFetchDto.urls,
      submitFetchDto.maxDepth,
    );

    return { batchId: batch.id };
  }

  @Get(':id')
  async getBatch(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('includeContent', new DefaultValuePipe(true), ParseBoolPipe)
    includeContent: boolean,
  ): Promise<BatchResultDto> {
    return this.batchService.getBatchWithPages(
      id,
      includeContent,
      limit,
      offset,
    );
  }
}
