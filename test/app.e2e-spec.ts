import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request, { Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { AxiosResponse } from 'axios';
import { Server } from 'http';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let httpService: HttpService;
  let httpServer: Server;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
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

  it('/health (GET)', () => {
    return request(httpServer)
      .get('/health')
      .expect(200)
      .expect((res: Response) => {
        const body = res.body as { status: string };
        expect(body.status).toBe('ok');
      });
  });

  it('should perform a full crawl workflow', async () => {
    // Setup mock responses for a 2-level crawl
    // Level 0: http://test.com -> links to http://test.com/page1
    // Level 1: http://test.com/page1 -> links to http://test.com/page2

    const mocks: Record<string, string> = {
      'http://test.com':
        '<html><a href="http://test.com/page1">Page 1</a></html>',
      'http://test.com/page1':
        '<html><a href="http://test.com/page2">Page 2</a></html>',
      'http://test.com/page2': '<html>End</a></html>',
    };

    jest.spyOn(httpService, 'get').mockImplementation((url: string) => {
      const body: string = mocks[url] ?? '';
      const axiosResponse: AxiosResponse<string> = {
        data: body,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
        config: {},
        request: { res: { responseUrl: url } } as never,
      };
      return of(axiosResponse);
    });

    const postRes = await request(httpServer)
      .post('/fetch')
      .send({
        urls: ['http://test.com'],
        maxDepth: 2,
      })
      .expect(201);
    const postBody = postRes.body as { batchId: string };
    const batchId = postBody.batchId;

    let status = 'running';
    let attempts = 0;
    while (status !== 'completed' && attempts < 20) {
      await new Promise((r) => setTimeout(r, 100));
      const getRes = await request(httpServer).get(`/fetch/${batchId}`);
      const getBody = getRes.body as { status: string };
      status = getBody.status;
      attempts++;
    }

    expect(status).toBe('completed');

    const resultRes = await request(httpServer)
      .get(`/fetch/${batchId}`)
      .expect(200);
    const resultBody = resultRes.body as {
      seedUrls: string[];
      pages: Array<{ url: string }>;
    };
    expect(resultBody.seedUrls).toEqual(['http://test.com']);
    const pages = resultBody.pages;
    expect(pages.length).toBeGreaterThanOrEqual(3);

    const urls = pages.map((p) => p.url);
    expect(urls).toContain('http://test.com');
    expect(urls).toContain('http://test.com/page1');
    expect(urls).toContain('http://test.com/page2');
  });
});
