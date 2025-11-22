export class PageResultDto {
  id: string;
  url: string;
  depth: number;
  statusCode: number | null;
  links: string[];
  error: string | null;
  durationMs: number | null;
  content: string | null;
}
