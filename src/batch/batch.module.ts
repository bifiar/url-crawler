import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatchEntity } from './entities/batch.entity';
import { PageEntity } from './entities/page.entity';
import { PageContentEntity } from './entities/page-content.entity';
import { BatchService } from './services/batch.service';
import { CommonModule } from '../common/common.module';
import { BatchController } from './batch.controller';
import { CrawlerModule } from '../crawler/crawler.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BatchEntity, PageEntity, PageContentEntity]),
    CommonModule,
    forwardRef(() => CrawlerModule),
  ],
  controllers: [BatchController],
  providers: [BatchService],
  exports: [BatchService],
})
export class BatchModule {}
