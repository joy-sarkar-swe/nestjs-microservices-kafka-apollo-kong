/**
 * @file scalars.ts
 * @description Registers the DateTime GraphQL scalar using graphql-scalars.
 *
 * Why graphql-scalars?
 * --------------------
 * NestJS code-first does not ship a DateTime scalar by default.
 * graphql-scalars provides RFC 3339-compliant DateTime serialisation/parsing
 * that is compatible with Apollo Federation v2 and GraphQL Code Generator.
 *
 * The scalar is imported here once and re-exported so every module that needs
 * it imports from a single location — no duplication.
 *
 * GraphQL schema output:
 *   scalar DateTime
 *
 * Wire format: ISO 8601 string  e.g. "2025-04-16T10:30:00.000Z"
 */
export { DateTimeResolver as DateTimeScalar } from "graphql-scalars";
