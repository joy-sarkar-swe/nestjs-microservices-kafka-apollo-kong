import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { GqlValidationFilter } from './common/filters/gql-validation.filter';

/**
 * @bootstrap  (blog-service)
 *
 * Hybrid application:
 *   1. HTTP :3002 — GraphQL subgraph (/graphql) + REST (/blogs/*)
 *   2. Kafka      — consumer group: blog-service-group
 *
 * GqlValidationFilter registered globally — converts BadRequestException
 * from ValidationPipe into structured ErrorResponse (part of ApiResponse union).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

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

  app.useGlobalFilters(new GqlValidationFilter());
  app.enableCors();

  await app.startAllMicroservices();
  await app.listen(process.env.PORT || 3002);

  console.log('🚀 blog-service running on http://localhost:3002');
  console.log('   ├─ GraphQL subgraph : http://localhost:3002/graphql');
  console.log('   └─ REST (Kong)      : http://localhost:3002/blogs/*');
  console.log(`📨 Kafka consumer      : ${process.env.KAFKA_BROKER || 'localhost:9092'} [blog-service-group]`);
}

bootstrap();
