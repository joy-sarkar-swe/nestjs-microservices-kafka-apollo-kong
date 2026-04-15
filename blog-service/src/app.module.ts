import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { BlogsModule } from './blogs/blogs.module';

/**
 * @module AppModule
 * @description Root module for blog-service.
 *
 * GraphQL — ApolloFederationDriver (code-first, Federation v2)
 *   Apollo Router introspects /graphql at startup to compose the supergraph.
 *   The Blog entity is annotated with @key(fields: "id").
 *   The User entity stub is annotated with @extends @key(fields: "id") so
 *   the Router knows to resolve full User fields from user-service.
 *
 * REST — registered via BlogsRestController inside BlogsModule.
 *   No extra config here; NestJS HTTP adapter handles routing automatically.
 */
@Module({
  imports: [
    // ── GraphQL Federation subgraph ────────────────────────────────────────
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      autoSchemaFile: { federation: 2 },
      playground: true,
      introspection: true,
    }),

    // ── Feature module ─────────────────────────────────────────────────────
    BlogsModule,
  ],
})
export class AppModule {}
