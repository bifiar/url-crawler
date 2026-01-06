# URL Crawler

NestJS-based URL crawler service with TypeORM/SQLite persistence.

## Commands

```bash
# Testing
npm test                 # Run all unit tests
npm run test:watch       # Watch mode for development
npm run test:cov         # Run with coverage report
npm run test:e2e         # Run end-to-end tests

# Building & Running
npm run build            # Build the project
npm run start:dev        # Development mode with watch
npm run start:prod       # Production mode (run build first)

# Code Quality
npm run lint             # ESLint with auto-fix
npm run format           # Prettier formatting
```

## Architecture

Feature-based modular structure:

```
src/
├── app.module.ts              # Root module
├── config/                    # Configuration (TypeORM)
├── common/                    # Shared utilities (filters, codecs)
├── batch/                     # Batch management (controller, service, entities, DTOs)
└── crawler/                   # Crawling logic (orchestrator, crawler, http-fetch, link-parser)
```

## Code Conventions

### File Naming
- Services: `*.service.ts`
- Controllers: `*.controller.ts`
- Modules: `*.module.ts`
- Entities: `*.entity.ts`
- DTOs: `*.dto.ts`
- Tests: `*.spec.ts` (co-located in `__tests__/` directories)
- E2E tests: `*.e2e-spec.ts` (in `test/` directory)

### Class Naming
- Services: `FooService`
- Controllers: `FooController`
- Entities: `FooEntity`
- DTOs: `FooDto`

### Testing Patterns
- Use `Test.createTestingModule()` from `@nestjs/testing`
- Mock dependencies with `jest.fn()` and `jest.Mocked<T>`
- Provide mocks via `useValue` in module providers
- Tests live in `__tests__/` subdirectories next to source files

Example test setup:
```typescript
const mockRepository = {
  save: jest.fn(),
  findOne: jest.fn(),
};

const module = await Test.createTestingModule({
  providers: [
    MyService,
    { provide: getRepositoryToken(MyEntity), useValue: mockRepository },
  ],
}).compile();
```

## Database

- TypeORM with SQLite
- Entities: `BatchEntity`, `PageEntity`, `PageContentEntity`
- Test environment uses in-memory SQLite
- Synchronize is enabled (auto-schema)

## Key Services

- **BatchService**: CRUD for batches and pages
- **CrawlerOrchestrator**: Fire-and-forget crawl scheduling
- **CrawlerService**: BFS crawl with concurrency control (p-limit)
- **HttpFetchService**: HTTP client wrapper with timeouts
- **LinkParserService**: HTML link extraction (Cheerio)
- **ContentCodecService**: zlib compression for page content

## Environment Variables

```
NODE_ENV=development
PORT=8080
DATABASE_PATH=data/url-crawler.db
CRAWLER_CONCURRENCY=50
CRAWLER_MAX_DEPTH=5
CRAWLER_MAX_PAGES=1000
HTTP_TIMEOUT_MS=10000
```

## API Endpoints

- `POST /fetch` - Submit URLs for crawling (returns batchId)
- `GET /fetch/:id` - Get batch results (supports `limit`, `offset`, `includeContent` query params)
- `GET /health` - Health check

## Important Notes

- ValidationPipe is applied globally with `transform`, `whitelist`, and `forbidNonWhitelisted`
- Global HttpExceptionFilter handles all errors
- ConfigService is used for environment variable access
- Use `@Injectable()` decorator on all services
- Async operations use async/await with proper error handling

## Node.js & TypeScript Best Practices

### Async/Await
- Always use `async/await` over raw Promises or callbacks
- Never ignore Promise rejections - always handle with try/catch or `.catch()`
- Use `Promise.all()` for concurrent independent operations
- Use `Promise.allSettled()` when you need results even if some fail
- Avoid floating promises - ESLint warns on `@typescript-eslint/no-floating-promises`

```typescript
// Good: concurrent operations
const [users, posts] = await Promise.all([
  this.userService.findAll(),
  this.postService.findAll(),
]);

// Good: handle all results even on partial failure
const results = await Promise.allSettled(urls.map(url => this.fetch(url)));
```

### Error Handling
- Use NestJS built-in exceptions (`BadRequestException`, `NotFoundException`, etc.)
- Let errors bubble up to the global HttpExceptionFilter
- Log errors with context using NestJS Logger
- Include meaningful error messages for debugging

```typescript
// Good
if (!entity) {
  throw new NotFoundException(`Resource ${id} not found`);
}

// Good: log with context
this.logger.error(`Failed to process ${id}`, error.stack);
```

### TypeScript
- Enable and respect strict mode (`strictNullChecks`, `noImplicitAny`)
- Use explicit return types on public methods
- Prefer `unknown` over `any` when type is truly unknown
- Use type guards for runtime type checking
- Leverage discriminated unions for state management

```typescript
// Good: explicit return type
async findById(id: string): Promise<UserEntity | null> {
  return this.repository.findOne({ where: { id } });
}

// Good: type guard
function isError(value: unknown): value is Error {
  return value instanceof Error;
}
```

### Dependency Injection
- Inject dependencies via constructor (NestJS standard)
- Use `private readonly` for injected dependencies
- Prefer interface-based injection for testability
- Keep services focused - single responsibility

```typescript
@Injectable()
export class MyService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(MyEntity)
    private readonly repository: Repository<MyEntity>,
  ) {}
}
```

### Resource Management
- Implement `OnModuleDestroy` for cleanup (close connections, clear intervals)
- Use `AbortController` for cancellable operations
- Set timeouts on HTTP requests and database queries
- Limit concurrency with `p-limit` for resource-intensive operations

```typescript
@Injectable()
export class MyService implements OnModuleDestroy {
  private readonly activeTasks = new Map<string, Promise<void>>();

  async onModuleDestroy() {
    await Promise.all(this.activeTasks.values());
  }
}
```

### Configuration
- Use `ConfigService` for all environment variables
- Provide sensible defaults: `configService.get('PORT', 3000)`
- Validate required config at startup
- Never hardcode secrets or environment-specific values

### Logging
- Use NestJS `Logger` with named context
- Log at appropriate levels: `log`, `warn`, `error`, `debug`
- Include relevant identifiers (IDs, URLs) in log messages
- Don't log sensitive data (passwords, tokens)

```typescript
private readonly logger = new Logger(MyService.name);

this.logger.log(`Processing batch ${batchId}`);
this.logger.error(`Failed to fetch ${url}`, error.stack);
```

### Input Validation
- Use class-validator decorators on DTOs
- Validate at controller level (ValidationPipe handles this)
- Sanitize user input before database operations
- Use TypeORM parameterized queries (automatic with repository methods)

```typescript
export class CreateUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  name: string;

  @IsEmail()
  email: string;
}
```

### Testing
- Test behavior, not implementation details
- Mock external dependencies (HTTP, database)
- Use descriptive test names that explain the scenario
- Arrange-Act-Assert pattern for test structure
- Reset mocks between tests with `beforeEach`

```typescript
describe('UserService', () => {
  describe('findById', () => {
    it('should return user when found', async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(mockUser);

      // Act
      const result = await service.findById('123');

      // Assert
      expect(result).toEqual(mockUser);
    });

    it('should return null when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const result = await service.findById('invalid');
      expect(result).toBeNull();
    });
  });
});
```

### Performance
- Use pagination for list endpoints (`limit`, `offset`)
- Select only needed columns in queries when possible
- Use database indexes on frequently queried columns
- Implement caching for expensive operations
- Stream large responses instead of loading into memory
