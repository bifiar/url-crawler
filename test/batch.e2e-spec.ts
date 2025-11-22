import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { HttpModule, HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import request from 'supertest';
import { BatchModule } from '../src/batch/batch.module';
import { CrawlerModule } from '../src/crawler/crawler.module';
import { BatchEntity } from '../src/batch/entities/batch.entity';
import { PageEntity } from '../src/batch/entities/page.entity';
import { PageContentEntity } from '../src/batch/entities/page-content.entity';
import { AxiosResponse } from 'axios';
import { Server } from 'http';

describe('Batch Integration', () => {
  let app: INestApplication;
  let httpService: HttpService;
  let httpServer: Server;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [BatchEntity, PageEntity, PageContentEntity],
          synchronize: true,
        }),
        BatchModule,
        CrawlerModule,
        HttpModule,
      ],
    })
      .overrideProvider(HttpService)
      .useValue({
        get: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    httpServer = app.getHttpServer() as Server;

    httpService = moduleFixture.get<HttpService>(HttpService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('/fetch (POST) should create a batch', async () => {
    // Mock HTTP response for the crawl
    jest.spyOn(httpService, 'get').mockImplementation(() => {
      const axiosResponse: AxiosResponse<string> = {
        data: '<html><a href="http://example.com/1">link</a></html>',
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
        config: {},
        request: { res: { responseUrl: 'http://example.com' } } as never,
      };
      return of(axiosResponse);
    });

    const response = await request(httpServer)
      .post('/fetch')
      .send({
        urls: ['http://example.com'],
        maxDepth: 1,
      })
      .expect(201);
    const responseBody = response.body as { batchId: string };
    expect(responseBody.batchId).toBeDefined();

    // Wait a bit for async crawl
    await new Promise((r) => setTimeout(r, 100));

    // Check status
    const statusRes = await request(httpServer)
      .get(`/fetch/${responseBody.batchId}`)
      .expect(200);

    const statusBody = statusRes.body as {
      batchId: string;
      seedUrls: string[];
    };
    expect(statusBody.batchId).toBe(responseBody.batchId);
    expect(statusBody.seedUrls).toEqual(['http://example.com']);
    // Status might be RUNNING or COMPLETED depending on timing
  });
});
