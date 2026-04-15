import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

/**
 * @bootstrap
 * @description Entry point for blog-service.
 *
 * Starts a **hybrid** NestJS application that simultaneously runs:
 *   1. HTTP server on :3002
 *      ├─ /graphql  — Apollo Federation subgraph (consumed by Apollo Router)
 *      └─ /blogs/*  — Pure REST endpoints (consumed by Kong Gateway directly)
 *   2. Kafka microservice consumer (groupId: blog-service-group)
 *      Subscribes to both user.* and blog.* topics.
 *
 * Architecture note
 * -----------------
 * Apollo Router introspects /graphql to compose the supergraph.
 * Kong proxies REST calls directly to /blogs/* — NO GraphQL translation needed.
 * Both entry points share the same BlogsService instance (single source of truth).
 *
 * @port   3002
 * @broker localhost:9092  (override: KAFKA_BROKER env var)
 */
async function bootstrap(): Promise<void> {
  // ── 1. Create HTTP application ───────────────────────────────────────────
  const app = await NestFactory.create(AppModule);

  // ── 2. Attach Kafka consumer transport ──────────────────────────────────
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'blog-service',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      },
      consumer: {
        // Separate group from user-service so each service gets ALL messages
        groupId: 'blog-service-group',
      },
    },
  });

  // ── 3. Global validation — applied to both GraphQL inputs and REST bodies ─
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ── 4. CORS — allow Apollo Router and Kong to reach this service ─────────
  app.enableCors();

  // ── 5. Start everything ──────────────────────────────────────────────────
  await app.startAllMicroservices(); // Kafka consumer
  await app.listen(process.env.PORT || 3002);

  console.log('🚀 blog-service HTTP running on  http://localhost:3002');
  console.log('   ├─ GraphQL subgraph: http://localhost:3002/graphql');
  console.log('   └─ REST endpoints:   http://localhost:3002/blogs/*');
  console.log(`📨 Kafka consumer on ${process.env.KAFKA_BROKER || 'localhost:9092'} [blog-service-group]`);
}

bootstrap();
