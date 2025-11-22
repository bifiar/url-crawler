import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { promisify } from 'util';

const deflate = promisify(zlib.deflate);
const inflate = promisify(zlib.inflate);

@Injectable()
export class ContentCodecService {
  async compress(content: string): Promise<Buffer> {
    try {
      return await deflate(content);
    } catch (error) {
      throw new InternalServerErrorException('Failed to compress content', {
        cause: error,
      });
    }
  }

  async decompress(buffer: Buffer): Promise<string> {
    try {
      const result = await inflate(buffer);
      return result.toString();
    } catch (error) {
      throw new InternalServerErrorException('Failed to decompress content', {
        cause: error,
      });
    }
  }

  calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
