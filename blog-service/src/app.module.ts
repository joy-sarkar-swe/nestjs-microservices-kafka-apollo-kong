import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloFederationDriver, ApolloFederationDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { GraphQLScalarType } from 'graphql';
import { DateTimeResolver } from 'graphql-scalars';
import { BlogsModule } from './blogs/blogs.module';

/**
 * @module AppModule  (blog-service)
 *
 * Additions vs original
 * ──────────────────────
 * subscriptions: graphql-ws transport enabled for GraphQL Subscriptions.
 *   Clients connect to ws://localhost:4002/graphql using the graphql-ws protocol.
 *
 *   Browser subscription example:
 *     import { createClient } from 'graphql-ws';
 *     const client = createClient({ url: 'ws://localhost:4002/graphql' });
 *     client.subscribe(
 *       { query: 'subscription { blogCreated { id title content authorId } }' },
 *       { next: (data) => console.log(data) }
 *     );
 *
 * Everything else unchanged from original.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      autoSchemaFile: {
        federation: {
          version: 2,
          importUrl: 'https://specs.apollo.dev/federation/v2.4',
        },
        path: './schema.graphql',
      },
      resolvers: {
        DateTime: DateTimeResolver as unknown as GraphQLScalarType,
      },
      playground: false,
      introspection: true,
      plugins: [ApolloServerPluginLandingPageLocalDefault()],

      // ── WebSocket subscriptions (graphql-ws protocol) ─────────────────
      // NestJS v13.2+ and Apollo Federation v2.4+ support this natively.
      subscriptions: {
        'graphql-ws': true,
      },

      context: ({ req }: { req: Request }) => ({ req }),
    }),

    BlogsModule,
  ],
})
export class AppModule {}
