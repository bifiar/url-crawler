import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { BatchEntity } from '../batch/entities/batch.entity';
import { PageEntity } from '../batch/entities/page.entity';
import { PageContentEntity } from '../batch/entities/page-content.entity';

export const typeOrmConfigFactory = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const isTest = configService.get('NODE_ENV') === 'test';

  return {
    type: 'sqlite',
    database: isTest
      ? ':memory:'
      : configService.get<string>('DATABASE_PATH', 'data/url-crawler.db'),
    entities: [BatchEntity, PageEntity, PageContentEntity],
    synchronize: true, // true for assignment simplicity
    logging: configService.get('NODE_ENV') === 'development',
  };
};
