import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { UsersModule } from './users/users.module';

/**
 * @module AppModule
 * @description Root module for user-service.
 *
 * GraphQL configuration
 * ---------------------
 * Uses ApolloFederationDriver (code-first) so NestJS generates the subgraph
 * SDL at runtime.  Apollo Router introspects this SDL at startup to compose
 * the supergraph.
 *
 * REST configuration
 * ------------------
 * REST routes are registered inside UsersModule via @nestjs/common controllers.
 * No extra configuration is needed here — NestJS HTTP adapter handles routing.
 */
@Module({
  imports: [
    // ── GraphQL Federation subgraph ────────────────────────────────────────
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      // code-first: schema generated from TypeScript decorators
      autoSchemaFile: { federation: 2 },
      // Enable playground for direct subgraph testing
      playground: true,
      introspection: true,
    }),

    // ── Feature modules ────────────────────────────────────────────────────
    UsersModule,
  ],
})
export class AppModule {}
