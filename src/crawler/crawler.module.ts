import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CrawlerService } from './services/crawler.service';
import { CrawlerOrchestrator } from './services/crawler-orchestrator.service';
import { HttpFetchService } from './services/http-fetch.service';
import { LinkParserService } from './services/link-parser.service';
import { BatchModule } from '../batch/batch.module';
import { BatchEntity } from '../batch/entities/batch.entity';
import { PageEntity } from '../batch/entities/page.entity';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BatchEntity, PageEntity]),
    HttpModule,
    ConfigModule,
    forwardRef(() => BatchModule),
    CommonModule,
  ],
  providers: [
    CrawlerService,
    CrawlerOrchestrator,
    HttpFetchService,
    LinkParserService,
  ],
  exports: [CrawlerOrchestrator],
})
export class CrawlerModule {}
