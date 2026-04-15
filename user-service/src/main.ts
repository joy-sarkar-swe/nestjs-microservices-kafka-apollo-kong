import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

/**
 * @bootstrap
 * @description Entry point for user-service.
 *
 * Starts a **hybrid** NestJS application that simultaneously runs:
 *   1. HTTP server on :3001 — serves the GraphQL Federation subgraph
 *      (consumed by Apollo Router) AND pure REST endpoints (consumed by Kong).
 *   2. Kafka microservice consumer (groupId: user-service-group) —
 *      receives domain events emitted by any service on the broker.
 *
 * Architecture note
 * -----------------
 * Both Apollo Router and Kong point at this same HTTP process:
 *   • Apollo Router → /graphql  (Federation subgraph introspection + queries)
 *   • Kong Gateway  → /users/*  (REST CRUD, no GraphQL involved)
 *
 * @port   3001
 * @broker localhost:9092  (override: KAFKA_BROKER env var)
 */
async function bootstrap(): Promise<void> {
  // ── 1. Create the HTTP application ──────────────────────────────────────
  const app = await NestFactory.create(AppModule);

  // ── 2. Attach Kafka consumer transport ──────────────────────────────────
  // connectMicroservice() registers an additional transport alongside HTTP.
  // Both transports share the same DI container and service instances.
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'user-service',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      },
      consumer: {
        groupId: 'user-service-group',
      },
    },
  });

  // ── 3. Global validation pipe ────────────────────────────────────────────
  // Applied to BOTH GraphQL inputs (via @Args) and REST bodies (via @Body).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // Strip undeclared properties
      forbidNonWhitelisted: true, // Throw 400 for unknown properties
      transform: true,            // Auto-cast primitives to declared types
    }),
  );

  // ── 4. CORS — allow Apollo Router and Kong to reach this subgraph ────────
  app.enableCors();

  // ── 5. Start everything ──────────────────────────────────────────────────
  await app.startAllMicroservices(); // Kafka consumer starts
  await app.listen(process.env.PORT || 3001);

  console.log('🚀 user-service HTTP running on  http://localhost:3001');
  console.log('   ├─ GraphQL subgraph: http://localhost:3001/graphql');
  console.log('   └─ REST endpoints:   http://localhost:3001/users/*');
  console.log(`📨 Kafka consumer on ${process.env.KAFKA_BROKER || 'localhost:9092'} [user-service-group]`);
}

bootstrap();
