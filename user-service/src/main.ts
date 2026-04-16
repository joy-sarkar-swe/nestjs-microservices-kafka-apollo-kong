import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { GqlValidationFilter } from './common/filters/gql-validation.filter';

/**
 * @bootstrap
 * @description Entry point for user-service.
 *
 * Hybrid application:
 *   1. HTTP :3001  — GraphQL subgraph (/graphql) + REST (/users/*)
 *   2. Kafka       — consumer group: user-service-group
 *
 * Global pipes & filters
 * ──────────────────────
 * ValidationPipe  — runs class-validator on all @Args and @Body inputs.
 *                   On failure it throws BadRequestException.
 * GqlValidationFilter — catches BadRequestException in GraphQL context,
 *                   converts it to ErrorResponse via ResponseFactory,
 *                   and returns it as the resolver result (not a raw error).
 *
 * Why register the filter globally here and not per-resolver?
 * ───────────────────────────────────────────────────────────
 * Registering once in main.ts guarantees it applies to every resolver
 * without per-resolver boilerplate. A missed @UseFilters() decorator
 * would mean some resolvers return raw errors — a production bug.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // ── Kafka consumer ─────────────────────────────────────────────────────
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'user-service',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      },
      consumer: { groupId: 'user-service-group' },
    },
  });

  // ── Validation pipe ────────────────────────────────────────────────────
  // exceptionFactory is set to return the raw ValidationError[] array so
  // GqlValidationFilter can transform it into typed FieldError objects.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Return structured ValidationError[] instead of plain string messages
      // so GqlValidationFilter can extract field-level details.
      exceptionFactory: (errors) => {
        const { BadRequestException } = require('@nestjs/common');
        return new BadRequestException(errors);
      },
    }),
  );

  // ── Global GraphQL validation filter ──────────────────────────────────
  // Intercepts BadRequestException in GraphQL context and converts it to
  // a structured ErrorResponse (part of the ApiResponse union).
  app.useGlobalFilters(new GqlValidationFilter());

  app.enableCors();

  await app.startAllMicroservices();
  await app.listen(process.env.PORT || 3001);

  console.log('🚀 user-service running on http://localhost:3001');
  console.log('   ├─ GraphQL subgraph : http://localhost:3001/graphql');
  console.log('   └─ REST (Kong)      : http://localhost:3001/users/*');
  console.log(`📨 Kafka consumer      : ${process.env.KAFKA_BROKER || 'localhost:9092'} [user-service-group]`);
}

bootstrap();
