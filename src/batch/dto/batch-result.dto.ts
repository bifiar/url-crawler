import { PageResultDto } from './page-result.dto';

export class BatchResultDto {
  batchId: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  error: string | null;
  seedUrls: string[];
  pages: PageResultDto[];
}
