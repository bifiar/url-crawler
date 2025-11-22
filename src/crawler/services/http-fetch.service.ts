import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

export interface FetchResult {
  statusCode: number;
  headers: Record<string, any>;
  body: string;
  durationMs: number;
  finalUrl: string;
}

@Injectable()
export class HttpFetchService {
  private readonly logger = new Logger(HttpFetchService.name);
  private readonly timeout: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.timeout = this.configService.get<number>('HTTP_TIMEOUT_MS', 10000);
  }

  async fetch(url: string): Promise<FetchResult> {
    const start = Date.now();
    try {
      const response = await firstValueFrom(
        this.httpService.get<string>(url, {
          timeout: this.timeout,
          maxRedirects: 4,
          validateStatus: () => true,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; url-crawler/1.0)',
          },
        }),
      );

      const durationMs = Date.now() - start;

      // Check content type, only return body for text/html
      const headers = response.headers as Record<
        string,
        string | string[] | undefined
      >;
      const contentTypeHeader =
        headers['content-type'] ?? headers['Content-Type'] ?? '';
      const contentType = Array.isArray(contentTypeHeader)
        ? contentTypeHeader.join(', ')
        : contentTypeHeader;
      const isHtml = contentType.includes('text/html');
      const finalUrl =
        (response.request as { res?: { responseUrl?: string } } | undefined)
          ?.res?.responseUrl ?? url;

      return {
        statusCode: response.status,
        headers: response.headers,
        body: isHtml && true ? response.data : '',
        durationMs,
        finalUrl,
      };
    } catch (error) {
      const durationMs = Date.now() - start;
      const axiosError = error as AxiosError;

      this.logger.error(
        `Failed to fetch ${url} after ${durationMs}ms: ${axiosError.message}`,
        axiosError.stack,
      );

      throw axiosError;
    }
  }
}
