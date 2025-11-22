import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import * as urlParser from 'url';

@Injectable()
export class LinkParserService {
  extractLinks(html: string, baseUrl: string): string[] {
    if (!html) {
      return [];
    }

    const $ = cheerio.load(html);
    const links = new Set<string>();

    $('a').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;

      try {
        // Resolve absolute URL
        const absoluteUrl = new urlParser.URL(href, baseUrl).toString();

        // Normalize and filter
        const parsedUrl = new urlParser.URL(absoluteUrl);

        // Remove fragment
        parsedUrl.hash = '';

        // Filter protocol
        if (['http:', 'https:'].includes(parsedUrl.protocol)) {
          links.add(parsedUrl.toString());
        }
      } catch {
        // Ignore invalid URLs
      }
    });

    return Array.from(links);
  }
}
