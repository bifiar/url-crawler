# Security Audit Report

**Project:** URL Crawler
**Date:** 2026-01-06
**Auditor:** Claude Code Security Audit
**Scope:** Full codebase review for common security vulnerabilities

---

## Executive Summary

This security audit identified **14 security issues** across the URL Crawler codebase. The most critical finding is a **Server-Side Request Forgery (SSRF) vulnerability** that could allow attackers to access internal services and cloud metadata endpoints. Additionally, the application lacks authentication, authorization, and rate limiting, making it susceptible to abuse.

| Severity | Count |
| -------- | ----- |
| Critical | 1     |
| High     | 3     |
| Medium   | 5     |
| Low      | 3     |
| Info     | 2     |

---

## Critical Findings

### 1. Server-Side Request Forgery (SSRF)

**Severity:** Critical
**Location:** `src/batch/dto/submit-fetch.dto.ts:13`, `src/crawler/services/http-fetch.service.ts:27-38`

**Description:**
The application accepts arbitrary URLs from user input and fetches them server-side without any validation of the target host. The `@IsUrl()` decorator only validates URL format, not the destination.

**Vulnerable Code:**

```typescript
// src/batch/dto/submit-fetch.dto.ts:11-15
@IsArray()
@IsUrl({}, { each: true })
@ArrayMinSize(1)
urls: string[];
```

```typescript
// src/crawler/services/http-fetch.service.ts:30-38
const response = await firstValueFrom(
  this.httpService.get<string>(url, {
    timeout: this.timeout,
    maxRedirects: 4,
    validateStatus: () => true,
    // No URL validation before fetch
  }),
);
```

**Attack Scenarios:**

- Access internal services: `http://localhost:8080/admin`
- Access cloud metadata: `http://169.254.169.254/latest/meta-data/`
- Port scan internal networks: `http://192.168.1.1:22`
- Access internal DNS: `http://internal-service.local/`
- File protocol abuse (if axios allows): `file:///etc/passwd`

**Impact:** An attacker could access internal services, steal cloud credentials (AWS/GCP/Azure metadata), scan internal networks, or pivot to other systems.

---

## High Severity Findings

### 2. Missing Authentication and Authorization

**Severity:** High
**Location:** `src/batch/batch.controller.ts`, `src/main.ts`

**Description:**
The application has no authentication or authorization mechanisms. All endpoints are publicly accessible, allowing anyone to:

- Submit URLs for crawling (abusing the service as an anonymizing proxy)
- Retrieve any batch's results by guessing/enumerating batch IDs
- Consume server resources without accountability

**Vulnerable Endpoints:**

- `POST /fetch` - No auth required
- `GET /fetch/:id` - No auth required
- `GET /health` - Appropriate to be public

**Impact:** Service abuse, resource exhaustion, potential legal liability if used for malicious crawling.

---

### 3. No Rate Limiting

**Severity:** High
**Location:** `src/main.ts`

**Description:**
The application has no rate limiting on any endpoint. While there's internal concurrency control (`p-limit`), there's no per-client or per-IP rate limiting.

**Attack Scenarios:**

- Submit thousands of crawl batches to exhaust server resources
- DoS via memory exhaustion from concurrent crawls
- Abuse as a DDoS amplification service

**Impact:** Denial of service, resource exhaustion, service unavailability.

---

### 4. Missing Security Headers (No Helmet)

**Severity:** High
**Location:** `src/main.ts`

**Description:**
The application does not use Helmet or equivalent middleware to set security headers. Missing headers include:

- `Content-Security-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Strict-Transport-Security`
- `X-XSS-Protection`

**Impact:** Increased vulnerability to clickjacking, MIME sniffing attacks, and XSS if the API ever serves HTML content.

---

## Medium Severity Findings

### 5. Database Synchronize Enabled in Production

**Severity:** Medium
**Location:** `src/config/typeorm.config.ts:18`

**Description:**
TypeORM's `synchronize` option is unconditionally set to `true`, which automatically modifies the database schema on startup.

**Vulnerable Code:**

```typescript
return {
  type: 'sqlite',
  database: isTest
    ? ':memory:'
    : configService.get<string>('DATABASE_PATH', 'data/url-crawler.db'),
  entities: [BatchEntity, PageEntity, PageContentEntity],
  synchronize: true, // true for assignment simplicity - DANGEROUS IN PRODUCTION
  logging: configService.get('NODE_ENV') === 'development',
};
```

**Impact:** Potential data loss in production if entity definitions change unexpectedly.

---

### 6. Information Disclosure in Error Responses

**Severity:** Medium
**Location:** `src/common/filters/http-exception.filter.ts:22-32`

**Description:**
The exception filter returns the full exception response which may include sensitive information, stack traces, or internal error details.

**Vulnerable Code:**

```typescript
const message =
  exception instanceof HttpException
    ? exception.getResponse() // May contain sensitive info
    : 'Internal server error';

response.status(status).json({
  statusCode: status,
  timestamp: new Date().toISOString(),
  path: request.url,
  error: message, // Exposed to client
});
```

**Impact:** Information leakage that could help attackers understand internal system structure.

---

### 7. No CORS Configuration

**Severity:** Medium
**Location:** `src/main.ts`

**Description:**
CORS is not explicitly configured. By default, NestJS may allow requests from any origin depending on the setup.

**Impact:** If the API is accessed from browsers, lack of CORS configuration could allow unauthorized cross-origin requests or, conversely, block legitimate requests.

---

### 8. Potential Denial of Service via Compression

**Severity:** Medium
**Location:** `src/common/services/content-codec.service.ts:11-29`

**Description:**
The compression service has no limits on the size of content being compressed or decompressed. A malicious server could return a "zip bomb" - a small compressed response that expands to gigabytes.

**Vulnerable Code:**

```typescript
async decompress(buffer: Buffer): Promise<string> {
  try {
    const result = await inflate(buffer);  // No size limits
    return result.toString();
  } catch (error) {
    throw new InternalServerErrorException('Failed to decompress content', {
      cause: error,
    });
  }
}
```

**Impact:** Memory exhaustion, denial of service.

---

### 9. Redirect Following May Bypass SSRF Filters

**Severity:** Medium
**Location:** `src/crawler/services/http-fetch.service.ts:33`

**Description:**
The HTTP client is configured to follow up to 4 redirects automatically. Even if SSRF filters were added, an attacker could redirect from an allowed external URL to an internal one.

**Vulnerable Code:**

```typescript
this.httpService.get<string>(url, {
  timeout: this.timeout,
  maxRedirects: 4, // Follows redirects blindly
  validateStatus: () => true,
});
```

**Attack Scenario:**

1. Attacker hosts `https://evil.com/redirect`
2. Redirect points to `http://169.254.169.254/latest/meta-data/`
3. SSRF filter only checks initial URL, not redirect target

**Impact:** SSRF filter bypass.

---

## Low Severity Findings

### 10. Predictable Resource Identifiers

**Severity:** Low
**Location:** `src/batch/entities/batch.entity.ts:19`

**Description:**
Batch IDs use UUIDs which, while random, can potentially be enumerated or guessed. Combined with no authentication, this allows access to any batch.

```typescript
@PrimaryGeneratedColumn('uuid')
id: string;
```

**Impact:** Unauthorized access to batch data (amplified by lack of authentication).

---

### 11. No Request Body Size Limits

**Severity:** Low
**Location:** `src/main.ts`

**Description:**
No explicit body size limits are configured. An attacker could send large payloads (e.g., arrays with millions of URLs) to exhaust memory.

**Impact:** Memory exhaustion, denial of service.

---

### 12. User-Agent Spoofing

**Severity:** Low
**Location:** `src/crawler/services/http-fetch.service.ts:35-36`

**Description:**
The crawler uses a spoofed User-Agent that mimics a regular browser.

```typescript
headers: {
  'User-Agent': 'Mozilla/5.0 (compatible; url-crawler/1.0)',
},
```

**Impact:** While common for crawlers, this could be used to bypass bot detection on target sites, potentially violating terms of service.

---

## Informational Findings

### 13. No HTTPS Enforcement

**Severity:** Info
**Location:** `src/main.ts`

**Description:**
The application does not enforce HTTPS or redirect HTTP to HTTPS. In production, this should be handled by a reverse proxy, but there's no validation.

**Impact:** Potential for man-in-the-middle attacks if deployed without proper TLS termination.

---

### 14. Logging May Leak Sensitive URLs

**Severity:** Info
**Location:** Multiple files (CrawlerService, HttpFetchService, etc.)

**Description:**
URLs are logged throughout the application. If users submit URLs containing sensitive information (e.g., tokens in query strings), these would be logged.

```typescript
this.logger.log(`Processing batch ${batchId}`);
this.logger.error(
  `Failed to fetch ${url} after ${durationMs}ms: ${axiosError.message}`,
);
```

**Impact:** Sensitive data exposure in logs.

---

## Recommendations Summary

| Priority | Recommendation                                        |
| -------- | ----------------------------------------------------- |
| P0       | Implement URL allowlist/blocklist for SSRF protection |
| P0       | Add authentication (JWT, API keys, or OAuth)          |
| P1       | Implement rate limiting (e.g., @nestjs/throttler)     |
| P1       | Add Helmet middleware for security headers            |
| P1       | Validate redirect targets for SSRF protection         |
| P2       | Disable `synchronize` in production environments      |
| P2       | Sanitize error responses in production                |
| P2       | Configure CORS explicitly                             |
| P2       | Add decompression size limits                         |
| P3       | Configure request body size limits                    |
| P3       | Add HTTPS enforcement or validation                   |
| P3       | Implement URL sanitization in logs                    |

---

## Files Reviewed

- `src/main.ts`
- `src/app.module.ts`
- `src/app.controller.ts`
- `src/config/typeorm.config.ts`
- `src/common/filters/http-exception.filter.ts`
- `src/common/services/content-codec.service.ts`
- `src/batch/batch.controller.ts`
- `src/batch/services/batch.service.ts`
- `src/batch/dto/submit-fetch.dto.ts`
- `src/batch/dto/batch-result.dto.ts`
- `src/batch/dto/page-result.dto.ts`
- `src/batch/entities/batch.entity.ts`
- `src/batch/entities/page.entity.ts`
- `src/batch/entities/page-content.entity.ts`
- `src/crawler/services/crawler.service.ts`
- `src/crawler/services/crawler-orchestrator.service.ts`
- `src/crawler/services/http-fetch.service.ts`
- `src/crawler/services/link-parser.service.ts`
- `package.json`

---

## Conclusion

The URL Crawler application has significant security gaps, particularly around SSRF and access control. The most urgent priority should be implementing URL validation to prevent SSRF attacks, followed by adding authentication and rate limiting. These issues should be addressed before any production deployment.
