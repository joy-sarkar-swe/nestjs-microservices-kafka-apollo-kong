import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from "@nestjs/apollo";
import { Module } from "@nestjs/common";
import { GraphQLModule } from "@nestjs/graphql";
import { GraphQLScalarType } from "graphql";
import { DateTimeResolver } from "graphql-scalars";
import { UsersModule } from "./users/users.module";

/**
 * @module AppModule
 * @description Root module for user-service.
 *
 * GraphQL configuration
 * ─────────────────────
 * Driver:         ApolloFederationDriver (code-first, Federation v2)
 * autoSchemaFile: true — schema generated from TS decorators at runtime.
 *                 When set to a file path (e.g. './schema.graphql'), NestJS
 *                 writes the SDL to disk — enabling GraphQL Code Generator,
 *                 CI schema linting, and schema diffing in CI pipelines.
 *                 Set to 'schema.graphql' for production; `true` for demos.
 *
 * DateTime scalar
 * ───────────────
 * Registered via the `resolvers` option. graphql-scalars provides a
 * Federation-compatible DateTime scalar with RFC 3339 wire format.
 * Must be registered here AND exported via @Scalar or the resolvers map.
 *
 * Apollo Router compatibility
 * ───────────────────────────
 * The ApolloFederationDriver serves the SDL at GET /_service so Apollo
 * Router can introspect it at startup without any extra configuration.
 */
@Module({
  imports: [
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,

      // ── Schema generation ────────────────────────────────────────────────
      // Change to './schema.graphql' to write the SDL to disk.
      // The generated file is what you commit for GraphQL Code Generator.
      autoSchemaFile: {
        federation: 2,
        path: "./schema.graphql", // ← uncomment to persist to disk
      },

      // ── Scalar registration ──────────────────────────────────────────────
      // Maps the 'DateTime' scalar name (used in @Field decorators) to the
      // graphql-scalars implementation that handles serialisation/parsing.
      resolvers: {
        DateTime: DateTimeResolver as unknown as GraphQLScalarType,
      },

      // ── Dev tooling ──────────────────────────────────────────────────────
      playground: false,
      introspection: true,

      // ── Landing page plugin ───────────────────────────────────────────────
      // Provides a better local development experience than Apollo Sandbox.
      plugins: [ApolloServerPluginLandingPageLocalDefault()],

      // ── Context forwarding ───────────────────────────────────────────────
      // Expose the raw HTTP request in the GraphQL context so filters and
      // guards can access headers (e.g. correlation ID, auth tokens).
      context: ({ req }: { req: Request }) => ({ req }),
    }),

    UsersModule,
  ],
})
export class AppModule {}
