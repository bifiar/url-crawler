import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Global Validation
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global Exception Filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Configuration
  const port = configService.get<number>('PORT', 8080);

  await app.listen(port);
  logger.log(`Application is running on: ${await app.getUrl()}`);
}

bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error(`Failed to start application`, error);
  process.exit(1);
});
