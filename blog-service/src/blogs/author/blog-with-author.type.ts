import { ResolvedUser } from "../../common/http/user-service.client";

/**
 * @type BlogWithAuthor
 * @description The REST response shape for a blog post with its fully resolved author.
 *
 * This type is returned by the REST controller instead of the raw `Blog` entity
 * so that REST consumers receive the same author enrichment that GraphQL clients
 * get via Apollo Federation.
 *
 * Why a separate type instead of mutating Blog?
 * ─────────────────────────────────────────────
 * The `Blog` entity is a GraphQL ObjectType decorated with NestJS/Apollo
 * decorators. Its `author` field is typed as `User` (the federation stub with
 * only `id`). Mutating it would introduce REST-specific concerns into the
 * GraphQL schema layer.
 *
 * This plain TypeScript interface is REST-only and carries no GraphQL decorators,
 * keeping the two layers cleanly separated.
 *
 * Shape
 * ─────
 * {
 *   id:        string          — blog UUID
 *   title:     string          — post headline
 *   content:   string          — post body text
 *   authorId:  string          — UUID of the author (retained for filtering)
 *   author:    ResolvedUser | null  — full author data, or null if unresolvable
 * }
 */
export interface BlogWithAuthor {
  /** UUID v4 primary key of the blog post. */
  id: string;

  /** Post headline. */
  title: string;

  /** Full body text of the post. */
  content: string;

  /**
   * UUID of the author — retained so REST consumers can re-query if needed.
   * Matches `author.id` when `author` is non-null.
   */
  authorId: string;

  /**
   * Fully resolved author from user-service.
   * `null` when user-service is unavailable or the user no longer exists.
   * Graceful degradation: blog data remains usable even without author details.
   */
  author: ResolvedUser | null;
}
