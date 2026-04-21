import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { AppModule } from "./app.module.js";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter.js";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor.js";

/**
 * @bootstrap  (user-service)
 *
 * Transport layers
 * ─────────────────
 * 1. HTTP :4001
 *    ├─ /graphql        — GraphQL subgraph (Apollo Router + Subscriptions via graphql-ws)
 *    └─ /users/*        — REST (Kong Gateway)
 *
 * 2. WebSocket :4001 (same port — NestJS multiplexes)
 *    ├─ /graphql        — graphql-ws subscription transport (GQL clients)
 *    └─ /users          — Socket.IO namespace (REST clients)
 *
 * 3. Kafka consumer   — group: user-service-group
 *
 * IoAdapter
 * ──────────
 * Swapping from the default WsAdapter to IoAdapter enables Socket.IO.
 * NestJS uses Socket.IO for @WebSocketGateway decorators.
 * graphql-ws is handled by the Apollo driver independently.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // ── Socket.IO adapter — required for UserEventsGateway ────────────────
  app.useWebSocketAdapter(new IoAdapter(app));

  // ── Kafka consumer ────────────────────────────────────────────────────
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: "user-service",
        brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
      },
      consumer: { groupId: "user-service-group" },
    },
  });

  // ── Validation pipe ───────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        return new BadRequestException(errors);
      },
    }),
  );

  // ── Global Interceptors ─────────────────────────────────────────────
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ── Global Filters ───────────────────────────────────────────────────
  app.useGlobalFilters(new GlobalExceptionFilter());

  app.enableCors();

  await app.startAllMicroservices();
  const port = process.env.PORT || 4001;
  await app.listen(port);

  console.log(`🚀 user-service running on http://localhost:${port}`);
  console.log(`   ├─ GraphQL (HTTP)        : http://localhost:${port}/graphql`);
  console.log(`   ├─ GraphQL (WS / gql-ws) : ws://localhost:${port}/graphql`);
  console.log(`   ├─ Socket.IO (/users ns)  : ws://localhost:${port}/users`);
  console.log(
    `   └─ REST (Kong)            : http://localhost:${port}/users/*`,
  );
  console.log(
    `📨 Kafka consumer            : ${process.env.KAFKA_BROKER || "localhost:9092"} [user-service-group]`,
  );
}

bootstrap();
