import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { DateTimeResolver } from 'graphql-scalars';
import { GraphQLScalarType } from 'graphql';
import { BlogsModule } from './blogs/blogs.module';

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
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      autoSchemaFile: {
        federation: 2,
        // path: './schema.graphql',  // uncomment to write SDL to disk
      },
      resolvers: {
        DateTime: DateTimeResolver as unknown as GraphQLScalarType,
      },
      playground: true,
      introspection: true,
      context: ({ req }: { req: Request }) => ({ req }),
    }),
    BlogsModule,
  ],
})
export class AppModule {}
