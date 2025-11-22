import { Test, TestingModule } from '@nestjs/testing';
import { ContentCodecService } from '../content-codec.service';

describe('ContentCodecService', () => {
  let service: ContentCodecService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContentCodecService],
    }).compile();

    service = module.get<ContentCodecService>(ContentCodecService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should compress and decompress strings correctly', async () => {
    const original = 'Hello, World! This is a test string for compression.';
    const compressed = await service.compress(original);

    expect(Buffer.isBuffer(compressed)).toBe(true);
    expect(compressed.length).toBeLessThan(original.length + 20); // small strings might inflate slightly due to headers, but checks buffer

    const decompressed = await service.decompress(compressed);
    expect(decompressed).toBe(original);
  });

  it('should handle empty strings', async () => {
    const original = '';
    const compressed = await service.compress(original);
    const decompressed = await service.decompress(compressed);
    expect(decompressed).toBe(original);
  });

  it('should throw error on invalid buffer decompression', async () => {
    const invalidBuffer = Buffer.from('not a compressed buffer');
    await expect(service.decompress(invalidBuffer)).rejects.toThrow();
  });
});
