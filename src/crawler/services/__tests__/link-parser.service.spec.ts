import { Test, TestingModule } from '@nestjs/testing';
import { LinkParserService } from '../link-parser.service';

describe('LinkParserService', () => {
  let service: LinkParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LinkParserService],
    }).compile();

    service = module.get<LinkParserService>(LinkParserService);
  });

  it('should extract absolute links', () => {
    const html = `
      <html>
        <body>
          <a href="/relative">Relative</a>
          <a href="https://example.com/absolute">Absolute</a>
        </body>
      </html>
    `;
    const baseUrl = 'https://example.com';
    const links = service.extractLinks(html, baseUrl);

    expect(links).toContain('https://example.com/relative');
    expect(links).toContain('https://example.com/absolute');
    expect(links.length).toBe(2);
  });

  it('should filter invalid protocols and normalize fragments', () => {
    const html = `
      <html lang="">
        <body>
          <a href="mailto:test@test.com">Mail</a>
          <a href="javascript:void(0)">JS</a>
          <a href="/page#fragment">Fragment</a>
        </body>
      </html>
    `;
    const baseUrl = 'https://example.com';
    const links = service.extractLinks(html, baseUrl);

    expect(links).toEqual(['https://example.com/page']);
  });
});
