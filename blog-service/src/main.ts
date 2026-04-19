import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { GqlValidationFilter } from './common/filters/gql-validation.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

/**
 * @bootstrap  (blog-service)
 *
 * Transport layers
 * ─────────────────
 * 1. HTTP :4002
 *    ├─ /graphql        — GraphQL subgraph (Apollo Router + Subscriptions via graphql-ws)
 *    └─ /blogs/*        — REST (Kong Gateway)
 *
 * 2. WebSocket :4002 (same port — NestJS multiplexes)
 *    ├─ /graphql        — graphql-ws subscription transport (GQL clients)
 *    └─ /blogs          — Socket.IO namespace (REST clients)
 *
 * 3. Kafka consumer   — group: blog-service-group
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // ── Socket.IO adapter — required for BlogEventsGateway ────────────────
  app.useWebSocketAdapter(new IoAdapter(app));

  // ── Kafka consumer ────────────────────────────────────────────────────
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'blog-service',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      },
      consumer: { groupId: 'blog-service-group' },
    },
  });

  // ── Validation pipe ───────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const { BadRequestException } = require('@nestjs/common');
        return new BadRequestException(errors);
      },
    }),
  );

  // ── Global Interceptors ─────────────────────────────────────────────
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ── Global Filters ───────────────────────────────────────────────────
  app.useGlobalFilters(new GqlValidationFilter(), new HttpExceptionFilter());

  app.enableCors();

  await app.startAllMicroservices();
  const port = process.env.PORT || 4002;
  await app.listen(port);

  console.log(`🚀 blog-service running on http://localhost:${port}`);
  console.log(`   ├─ GraphQL (HTTP)        : http://localhost:${port}/graphql`);
  console.log(`   ├─ GraphQL (WS / gql-ws) : ws://localhost:${port}/graphql`);
  console.log(`   ├─ Socket.IO (/blogs ns)  : ws://localhost:${port}/blogs`);
  console.log(`   └─ REST (Kong)            : http://localhost:${port}/blogs/*`);
  console.log(`📨 Kafka consumer            : ${process.env.KAFKA_BROKER || 'localhost:9092'} [blog-service-group]`);
}

bootstrap();
