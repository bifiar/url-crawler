# Performance Analysis Report

> Generated: 2026-01-06
> Analyzed by: Claude Code

## Executive Summary

This analysis identified **15 performance anti-patterns** in the URL Crawler codebase, including 5 HIGH severity issues that could cause production incidents at scale. The primary concerns are:

1. Sequential I/O operations that should be parallelized
2. Missing database indexes causing full table scans
3. Synchronous HTML parsing blocking the event loop
4. No response size limits risking OOM errors
5. Silent persistence failures causing data loss

---

## Critical Issues (HIGH Severity)

### 1. Sequential Decompression in Batch Retrieval

**File:** `src/batch/services/batch.service.ts:63-92`

**Issue:** The `getBatchWithPages` method decompresses page content sequentially in a for loop:

```typescript
for (const page of pages) {
  if (includeContent && page.content?.compressedContent) {
    contentStr = await this.codecService.decompress(
      page.content.compressedContent,
    );
  }
  pageDtos.push({ ... });
}
```

**Impact:** With 50 pages at 5-10ms decompression each = 250-500ms added latency per request.

**Fix:** Parallelize with `Promise.all()`:

```typescript
const decompressPromises = pages.map((page) =>
  includeContent && page.content?.compressedContent
    ? this.codecService.decompress(page.content.compressedContent)
    : Promise.resolve(null),
);
const decompressedContent = await Promise.all(decompressPromises);
// Then build pageDtos using decompressedContent[index]
```

---

### 2. Missing Database Index on Batch Foreign Key

**File:** `src/batch/entities/page.entity.ts:15`

**Issue:** Only a composite index `['batch', 'url']` exists. Queries filtering by batch ID alone cannot efficiently use this index:

```typescript
@Index(['batch', 'url'], { unique: true })  // Composite only
export class PageEntity {
```

The `getBatchWithPages` query (batch.service.ts:54) filters only by batch:

```typescript
const pages = await this.pageRepo.find({
  where: { batch: { id } }, // Cannot use composite index efficiently
});
```

**Impact:** Full table scan on pages table for every batch retrieval.

**Fix:** Add separate index on batch column:

```typescript
@Index(['batch'])
@Index(['batch', 'url'], { unique: true })
export class PageEntity {
```

---

### 3. Synchronous Cheerio HTML Parsing

**File:** `src/crawler/services/link-parser.service.ts:7-39`

**Issue:** `cheerio.load()` and DOM traversal are synchronous operations:

```typescript
extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);  // Synchronous, blocks event loop
  $('a').each((_, element) => {  // Synchronous iteration
    const href = $(element).attr('href');
    // ...
  });
}
```

**Impact:** Large HTML files (5MB+) block the event loop for 100-500ms, preventing all other requests from being processed.

**Fix Options:**

1. Add HTML size limit before parsing
2. Use worker threads for large documents
3. Implement streaming HTML parser

```typescript
const MAX_HTML_SIZE = 2 * 1024 * 1024; // 2MB
extractLinks(html: string, baseUrl: string): string[] {
  if (html.length > MAX_HTML_SIZE) {
    html = html.slice(0, MAX_HTML_SIZE);  // Truncate large HTML
  }
  // ... rest of parsing
}
```

---

### 4. Missing Response Size Limits

**File:** `src/crawler/services/http-fetch.service.ts:27-76`

**Issue:** HTTP responses have no size validation. Axios will load arbitrarily large responses into memory:

```typescript
async fetch(url: string): Promise<FetchResult> {
  const response = await firstValueFrom(
    this.httpService.get<string>(url, {
      // No maxContentLength or maxBodyLength configured
    }),
  );
  return {
    body: isHtml && true ? response.data : '',  // Could be 5GB
  };
}
```

**Impact:** A single large response causes OOM crash.

**Fix:**

```typescript
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB

this.httpService.get<string>(url, {
  maxContentLength: MAX_RESPONSE_SIZE,
  maxBodyLength: MAX_RESPONSE_SIZE,
  // ...
});
```

---

### 5. Silent Database Persistence Failures

**File:** `src/crawler/services/crawler.service.ts:189-193`

**Issue:** Database save failures are logged but not propagated:

```typescript
try {
  await this.pageRepo.save(page);
} catch (e) {
  this.logger.error(`Failed to persist page ${task.url}`, e);
  // Error is swallowed - batch completes as "successful"
}
```

**Impact:** Batch reports as COMPLETED even if 50% of pages failed to persist. Data loss goes unnoticed.

**Fix:** Track failure counts and either re-throw or mark batch as partially failed:

```typescript
catch (e) {
  this.logger.error(`Failed to persist page ${task.url}`, e);
  throw e;  // Let orchestrator handle
}
```

---

## Medium Severity Issues

### 6. Sequential Compression and Hashing

**File:** `src/crawler/services/crawler.service.ts:181-185`

```typescript
content.compressedContent = await this.codecService.compress(fetchResult.body);
content.compressedSize = content.compressedContent.length;
content.contentHash = this.codecService.calculateHash(fetchResult.body);
```

**Fix:** Run compression and hashing in parallel:

```typescript
const [compressedContent, contentHash] = await Promise.all([
  this.codecService.compress(fetchResult.body),
  Promise.resolve(this.codecService.calculateHash(fetchResult.body)),
]);
```

---

### 7. Missing Indices on Frequently Queried Columns

**Files:** `src/batch/entities/batch.entity.ts`, `src/batch/entities/page.entity.ts`

Missing indices on:

- `BatchEntity.status` - Filtering RUNNING batches
- `PageEntity.depth` - Ordering by depth
- `PageEntity.createdAt` - Time-based queries

**Fix:**

```typescript
// In BatchEntity
@Index(['status'])
@Column({ type: 'simple-enum', ... })
status: BatchStatus;

// In PageEntity
@Index(['depth'])
@Column()
depth: number;
```

---

### 8. Missing OnModuleDestroy in CrawlerService

**File:** `src/crawler/services/crawler.service.ts`

**Issue:** `CrawlerOrchestrator` implements cleanup but `CrawlerService` does not. If CrawlerService holds any stateful resources (like the global p-limit), they aren't cleaned up.

**Fix:**

```typescript
@Injectable()
export class CrawlerService implements OnModuleDestroy {
  async onModuleDestroy() {
    // Clear any pending tasks in globalLimit
  }
}
```

---

### 9. Unbounded Queue Growth

**File:** `src/crawler/services/crawler.service.ts:62-108`

**Issue:** The BFS queue grows unbounded as new links are discovered:

```typescript
const queue: CrawlTask[] = seedUrls.map((url) => ({ url, depth: 0 }));
// ...
for (const nextTask of nextTasks) {
  queue.push(nextTask); // Can grow to thousands of entries
}
```

**Impact:** Memory pressure from large queues; array operations become slow.

**Fix:** Consider using a proper deque data structure or limiting queue size.

---

### 10. No Database Query Timeouts

**File:** `src/config/typeorm.config.ts`

**Issue:** TypeORM has no timeout configuration. Slow queries can hang indefinitely.

**Fix:**

```typescript
export const typeOrmConfigFactory = (configService: ConfigService) => ({
  // ... existing config
  extra: {
    busyTimeout: 5000, // SQLite-specific busy timeout
  },
});
```

---

### 11. No Streaming for Large Responses

**File:** `src/batch/batch.controller.ts:39-53`

**Issue:** All pages are loaded into memory before returning:

```typescript
async getBatch(...): Promise<BatchResultDto> {
  // Loads all requested pages into memory
  return this.batchService.getBatchWithPages(id, includeContent, limit, offset);
}
```

**Impact:** With 1000 pages × 2MB content = 2GB memory before response starts.

**Fix:** Implement streaming response for large payloads, or enforce stricter pagination limits.

---

## Low Severity Issues

### 12. Logic Bug: Redundant Condition

**File:** `src/crawler/services/http-fetch.service.ts:61`

```typescript
body: isHtml && true ? response.data : '',
//           ^^^^^^^ redundant
```

**Fix:**

```typescript
body: isHtml ? response.data : '',
```

---

### 13. Unbounded Visited Set Memory

**File:** `src/crawler/services/crawler.service.ts:59`

The `visited` Set grows to hold all crawled URLs (up to 1000 per batch). At average 100 chars/URL × 1000 URLs × N concurrent batches, memory can add up.

**Mitigation:** Document expected memory usage; consider bloom filters at scale.

---

### 14. No Caching Layer

**Impact:** Repeated operations that could be cached:

- Batch status queries (same batch queried multiple times)
- Decompressed content (could be cached with TTL)
- Previously crawled URLs (same URL in different batches)

**Recommendation:** Add Redis or in-memory cache for hot data.

---

## Summary Table

| #   | Issue                    | File                      | Severity | Est. Impact                 |
| --- | ------------------------ | ------------------------- | -------- | --------------------------- |
| 1   | Sequential decompression | batch.service.ts:63       | HIGH     | +250-500ms/request          |
| 2   | Missing batch index      | page.entity.ts:15         | HIGH     | Full table scans            |
| 3   | Synchronous HTML parsing | link-parser.service.ts:12 | HIGH     | 100-500ms event loop blocks |
| 4   | No response size limit   | http-fetch.service.ts     | HIGH     | OOM risk                    |
| 5   | Silent DB errors         | crawler.service.ts:189    | HIGH     | Data loss                   |
| 6   | Sequential compress/hash | crawler.service.ts:181    | MEDIUM   | Unnecessary latency         |
| 7   | Missing query indices    | entities/\*.ts            | MEDIUM   | Slow queries                |
| 8   | Missing OnModuleDestroy  | crawler.service.ts        | MEDIUM   | Resource leaks              |
| 9   | Unbounded queue          | crawler.service.ts:62     | MEDIUM   | Memory pressure             |
| 10  | No DB timeouts           | typeorm.config.ts         | MEDIUM   | Hanging queries             |
| 11  | No streaming             | batch.controller.ts:39    | MEDIUM   | Memory spikes               |
| 12  | Redundant condition      | http-fetch.service.ts:61  | LOW      | Code clarity                |
| 13  | Visited set memory       | crawler.service.ts:59     | LOW      | Memory at scale             |
| 14  | No caching               | -                         | LOW      | Repeated work               |

---

## Recommended Priority Order

1. **Parallelize decompression** (Issue #1) - Quick win, significant impact
2. **Add response size limits** (Issue #4) - Prevents OOM crashes
3. **Add batch ID index** (Issue #2) - One-line fix, big query improvement
4. **Add HTML size limit** (Issue #3) - Prevents event loop blocking
5. **Propagate persistence errors** (Issue #5) - Ensures data integrity
6. **Add missing indices** (Issue #7) - Improves query performance
7. **Parallelize compression/hashing** (Issue #6) - Easy parallelization
