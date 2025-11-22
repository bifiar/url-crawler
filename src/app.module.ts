import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { BatchModule } from './batch/batch.module';
import { CrawlerModule } from './crawler/crawler.module';
import { typeOrmConfigFactory } from './config/typeorm.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: typeOrmConfigFactory,
    }),
    BatchModule,
    CrawlerModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
