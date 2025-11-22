import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { HttpFetchService } from '../http-fetch.service';
import { of } from 'rxjs';
import { AxiosHeaders, AxiosResponse } from 'axios';

describe('HttpFetchService', () => {
  let service: HttpFetchService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HttpFetchService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(1000),
          },
        },
      ],
    }).compile();

    service = module.get<HttpFetchService>(HttpFetchService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should fetch and return HTML content', async () => {
    const mockResponse: AxiosResponse = {
      data: '<html lang=""></html>',
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/html' },
      config: {
        headers: new AxiosHeaders(),
      },
      request: {
        res: {
          responseUrl: 'https://example.com',
        },
      },
    };

    jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

    const result = await service.fetch('https://example.com');

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('<html lang=""></html>');
    expect(result.finalUrl).toBe('https://example.com');
  });

  it('should ignore non-HTML content', async () => {
    const mockResponse: AxiosResponse = {
      data: 'binary data',
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/octet-stream' },
      config: {
        headers: new AxiosHeaders(),
      },
      request: {},
    };

    jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

    const result = await service.fetch('https://example.com/file.bin');

    expect(result.body).toBe('');
  });
});
