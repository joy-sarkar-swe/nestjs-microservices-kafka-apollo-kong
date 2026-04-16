import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from "@nestjs/apollo";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { GraphQLModule } from "@nestjs/graphql";
import { GraphQLScalarType } from "graphql";
import { DateTimeResolver } from "graphql-scalars";
import { BlogsModule } from "./blogs/blogs.module";

/**
 * @module AppModule  (blog-service)
 *
 * GraphQL: ApolloFederationDriver, code-first, Federation v2.
 *   autoSchemaFile generates the subgraph SDL at runtime.
 *   Apollo Router introspects this SDL via GET /_service.
 *   Set path: './schema.graphql' to persist SDL to disk for Code Generator.
 *
 * DateTime scalar: registered via graphql-scalars DateTimeResolver.
 *   Required for all timestamp fields in the response system.
 */
@Module({
  imports: [
    // ── Configuration ───────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true, // Makes ConfigService available everywhere
    }),

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

    BlogsModule,
  ],
})
export class AppModule {}
