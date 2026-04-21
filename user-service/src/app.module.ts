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
import { UsersModule } from "./users/users.module.js";

/**
 * @module AppModule  (user-service)
 *
 * Additions vs original
 * ──────────────────────
 * subscriptions: graphql-ws transport enabled for GraphQL Subscriptions.
 *   Clients connect via WebSocket to /graphql and use the graphql-ws protocol.
 *   Apollo Sandbox supports subscriptions natively.
 *
 *   Protocol: graphql-ws (recommended over subscriptions-transport-ws)
 *   Client lib: graphql-ws  npm install graphql-ws
 *
 *   Browser example:
 *     import { createClient } from 'graphql-ws';
 *     const client = createClient({ url: 'ws://localhost:4001/graphql' });
 *     client.subscribe(
 *       { query: 'subscription { userCreated { id name email } }' },
 *       { next: (data) => console.log(data) }
 *     );
 *
 * Everything else — driver, federation, DateTime scalar, context — is unchanged.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      autoSchemaFile: {
        federation: {
          version: 2,
          importUrl: "https://specs.apollo.dev/federation/v2.4",
        },
        path: "./schema.graphql",
      },
      resolvers: {
        DateTime: DateTimeResolver as unknown as GraphQLScalarType,
      },
      playground: false,
      introspection: true,
      plugins: [ApolloServerPluginLandingPageLocalDefault() as any],

      // ── WebSocket subscriptions (graphql-ws protocol) ─────────────────
      // NestJS v13.2+ and Apollo Federation v2.4+ support this natively.
      subscriptions: {
        "graphql-ws": true,
      },

      context: ({ req }: { req: Request }) => ({ req }),
    }),

    UsersModule,
  ],
})
export class AppModule {}
