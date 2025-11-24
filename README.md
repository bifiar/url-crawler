# URL Crawler Service

A production-grade URL crawler service built with NestJS. This service allows submitting batches of URLs to be crawled recursively up to a configurable depth, stores the results (including compressed content), and exposes APIs to retrieve the crawled data.

## Features

- **Recursive Crawling**: Crawls URLs up to a specified depth (BFS).
- **Concurrency Control**: Limits concurrent HTTP requests to prevent overloading the system or target servers.
- **Page Cap**: Enforces a configurable per-batch page limit (default 1,000) so crawls cannot grow unbounded.
- **Persistence**: Stores crawl results and metadata in SQLite.
- **Content Compression**: Compresses page content using zlib to save storage space.
- **Deduplication**: Avoids processing the same URL multiple times within a batch.
- **Resilience**: Handles network errors, timeouts, and redirects gracefully.
- **API**: RESTful API for submitting jobs and retrieving results.

## Prerequisites

- Node.js (LTS version recommended, e.g., v18+)
- NPM

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/bifiar/url-crawler.git
   cd url-crawler
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure environment variables (optional, defaults provided):
   Copy `.env.example` to `.env` and adjust values.
   ```bash
   cp env.example .env
   ```

## Environment Variables

These values control runtime behavior and can be overridden through `.env` or process-level environment variables:

- `NODE_ENV`: Node runtime mode (`development`, `production`, etc.).
- `PORT`: HTTP port the Nest app listens on (defaults to `8080`).
- `DATABASE_PATH`: Path to the SQLite database file.
- `CRAWLER_CONCURRENCY`: Max number of pages fetched in parallel per instance.
- `CRAWLER_MAX_DEPTH`: Default maximum crawl depth (individual requests can lower it via `maxDepth`).
- `CRAWLER_MAX_PAGES`: Hard cap on pages processed per batch to avoid runaway crawls.
- `HTTP_TIMEOUT_MS`: Timeout for outbound HTTP fetches, in milliseconds.

When deploying, copy `env.example` to `.env` and tweak the values for your environment (e.g., larger concurrency on beefier machines).

## Running the Application

### Development

```bash
npm run start:dev
```

### Production

1. Build the application:
   ```bash
   npm run build
   ```
2. Start the application:
   ```bash
   npm run start:prod
   ```

The server defaults to listening on port `8080`.

## API Documentation

### 1. Submit a Crawl Batch

**POST** `/fetch`

Submits a list of URLs to be crawled.

**Request Body:**

```json
{
  "urls": ["http://example.com", "http://test.com"],
  "maxDepth": 2
}
```

- `urls`: Array of valid HTTP/HTTPS URLs.
- `maxDepth` (optional): Maximum crawl depth (default: 5, max: 10).
- `urls` must contain at least one entry; empty submissions are rejected with HTTP 400.
- Each batch processes up to `CRAWLER_MAX_PAGES` pages (default: 1,000) regardless of depth to protect resources.

**Response:**

```json
{
  "batchId": "uuid-string"
}
```

### 2. Get Batch Results

**GET** `/fetch/:batchId`

Retrieves the status and results of a batch.

**Query Parameters:**

- `limit` (default: 50): Number of pages to return.
- `offset` (default: 0): Pagination offset.
- `includeContent` (default: ture): If `true`, returns decompressed page content.

**Response:**

```json
{
  "batchId": "uuid-string",
  "status": "completed",
  "createdAt": "2023-10-27T10:00:00.000Z",
  "completedAt": "2023-10-27T10:05:00.000Z",
  "seedUrls": ["http://example.com"],
  "pages": [
    {
      "id": "page-uuid",
      "url": "http://example.com",
      "depth": 0,
      "statusCode": 200,
      "links": ["http://example.com/about"],
      "content": "<html>...</html>"
    }
  ]
}
```

### Example Workflow (curl)

Simple end-to-end session against a local instance:

```bash
# 1. Submit a batch (defaults to depth 5, 1,000-page cap)
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"urls":["https://example.com"]}' \
  http://localhost:8080/fetch

# Response
{"batchId":"ac965c29-41b6-4113-b424-02fe55a560c7"}
```

```bash
# 2. Fetch batch status/results (note: escape '?' in zsh or wrap the URL in quotes)
curl "http://localhost:8080/fetch/ac965c29-41b6-4113-b424-02fe55a560c7?limit=2&includeContent=false"

# Sample response
{
  "batchId": "ac965c29-41b6-4113-b424-02fe55a560c7",
  "status": "completed",
  "createdAt": "2025-11-24T09:41:08.000Z",
  "completedAt": "2025-11-24T09:41:36.845Z",
  "seedUrls": ["https://example.com"],
  "pages": [
    {
      "id": "66853853-fdc8-45e8-8289-d5358dc886ca",
      "url": "https://example.com",
      "depth": 0,
      "statusCode": 200,
      "links": ["https://iana.org/domains/example"],
      "durationMs": 550
    },
    {
      "id": "12f7fdf8-310d-45f8-beef-63a1eb356852",
      "url": "https://iana.org/domains/example",
      "depth": 1,
      "statusCode": 200,
      "links": ["http://www.iana.org/", "..."],
      "durationMs": 1723
    }
  ]
}
```

### 3. Health Check

**GET** `/health`

Returns service status.

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2023-10-27T10:00:00.000Z"
}
```

## Testing

### Unit Tests

```bash
npm run test
```

### End-to-End Tests

```bash
npm run test:e2e
```

## Deployment on Google Cloud Platform (GCP) Compute Engine

The service is designed to run on a VM instance.

### Steps:

1. **Connect to VM:**
   Use the provided private key to SSH into the instance.

   ```bash
   ssh -i <path_to_private_key> candidate@<IP_ADDRESS>
   ```

2. **Install Node.js:**
   Install NVM (Node Version Manager) and Node.js.

   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
   source ~/.bashrc
   nvm install --lts
   ```

3. **Install Git:**

   ```bash
   sudo apt-get update
   sudo apt-get install -y git
   ```

4. **Install Nest CLI:**

   The build command uses the Nest CLI, so install it globally (or plan to run `npx nest build`).

   ```bash
   npm install -g @nestjs/cli
   ```

5. **Clone & Setup:**

   ```bash
   git clone https://github.com/bifiar/url-crawler.git
   cd url-crawler
   npm install
   npm run build
   ```

6. **Environment Setup:**
   Create `.env` file or set environment variables.

   ```bash
   echo "PORT=8080" > .env
   ```

7. **Run with PM2:**
   Use PM2 to keep the application running in the background.

   ```bash
   npm install -g pm2
   pm2 start npm --name url-crawler -- run start:prod
   pm2 save
   pm2 startup
   ```

   If you don't need PM2, you can simply run:

   ```bash
   npm run start:prod
   ```

8. **Access:**
   The service listens on port `8080`. Ensure GCP firewall allows traffic on TCP:8080.

   Test locally on VM:

   ```bash
   curl http://localhost:8080/health
   ```

   Example end-to-end calls from your workstation (replace `<candidate_ip>` with the VM’s public IP):

   ```bash
   # Submit a batch crawl
   curl -X POST \
     -H "Content-Type: application/json" \
     -d '{"urls": ["https://example.com"]}' \
     http://<candidate_ip>:8080/fetch

   # Example response
   {"batchId":"4dbd5abb-18a6-4f93-ba59-36fb058c22d0"}

   # Fetch the batch results
   curl "http://<candidate_ip>:8080/fetch/4dbd5abb-18a6-4f93-ba59-36fb058c22d0?limit=2&includeContent=false"

   # Example response (truncated for brevity)
   {
     "batchId": "4dbd5abb-18a6-4f93-ba59-36fb058c22d0",
     "status": "completed",
     "createdAt": "2025-11-24T10:51:23.000Z",
     "completedAt": "2025-11-24T10:51:58.277Z",
     "seedUrls": ["https://example.com"],
     "pages": [
       { "id": "0bf432db-6d8c-457f-93ee-3e8f412b2647", "url": "https://example.com", "depth": 0, "statusCode": 200, ... },
       { "id": "5fdfed3a-f7d6-4434-95c8-9279f1a6feff", "url": "https://iana.org/domains/example", "depth": 1, "statusCode": 200, ... }
     ]
   }
   ```

## Implementation Decisions & Trade-offs

- **SQLite**: Chosen for simplicity and zero-config persistence for this assignment. In a large-scale distributed system, a dedicated database (PostgreSQL) and a distributed queue (Redis/BullMQ) would be preferred.
- **Compression**: Page content is compressed (zlib) before storage to minimize disk usage.
- **Concurrency**: `p-limit` is used to control the number of parallel HTTP requests per batch to avoid resource exhaustion.
- **In-Memory Orchestration**: Current implementation runs crawls in the background of the API server. For scaling, this should be moved to separate worker processes.
