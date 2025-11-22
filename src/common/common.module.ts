import { Module } from '@nestjs/common';
import { ContentCodecService } from './services/content-codec.service';

@Module({
  providers: [ContentCodecService],
  exports: [ContentCodecService],
})
export class CommonModule {}
