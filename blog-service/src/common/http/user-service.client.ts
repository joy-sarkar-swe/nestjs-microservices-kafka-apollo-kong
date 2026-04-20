import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * @interface ResolvedUser
 * @description The minimal User shape returned by user-service REST API.
 * Matches the `User` entity shape owned by user-service — only the fields
 * we actually need in blog-service REST responses.
 */
export interface ResolvedUser {
  /** UUID v4 — the primary key used to correlate with Blog.authorId. */
  id: string;
  /** Full display name of the user. */
  name: string;
  /** Unique email address of the user. */
  email: string;
}

/**
 * @service UserServiceClient
 * @description HTTP client for resolving User data from user-service.
 *
 * Why this exists
 * ───────────────
 * In GraphQL, Apollo Router transparently resolves `author { name email }`
 * by dispatching a federated `_entities` batch request to user-service.
 * In REST, there is no Router — blog-service REST endpoints return raw Blog
 * objects with only `authorId`. Without this client, REST consumers would
 * receive `author: { id: "..." }` with no name or email.
 *
 * This client gives REST responses the same author enrichment that GraphQL
 * gets for free from federation.
 *
 * Production design decisions
 * ────────────────────────────
 * 1. **Batch-first** — `resolveMany()` accepts an array of ids and issues a
 *    single HTTP call using `?ids=id1,id2,...`. For N blogs in a list response,
 *    this is exactly 1 HTTP call regardless of N — no N+1 problem.
 *
 * 2. **TTL cache** — `resolveOne()` caches individual users for
 *    `CACHE_TTL_MS` (default 60 s). User data is stable within a request
 *    window; caching avoids redundant roundtrips for repeated single-blog fetches.
 *    Cache is per-process (in-memory). For multi-instance deployments, swap
 *    to Redis using the same interface.
 *
 * 3. **Graceful degradation** — if user-service is unavailable or returns a
 *    non-2xx status, the client returns `null` for that user. REST responses
 *    will include `author: null` rather than failing the entire request. This
 *    is intentional: blog data is still valid even if the author cannot be
 *    resolved at this moment (eventual consistency).
 *
 * 4. **No circular dependency** — blog-service → user-service is a one-way
 *    dependency via REST. user-service never calls blog-service. This mirrors
 *    the federation model where blog-service owns Blog and references User
 *    by key only.
 *
 * 5. **Timeout** — each request has a 5-second AbortController timeout to
 *    prevent hanging the REST response when user-service is slow.
 *
 * Configuration
 * ─────────────
 * USER_SERVICE_URL  env var (default: http://localhost:4001)
 *   Set this to the internal service URL in production (e.g. http://user-service:4001).
 */
@Injectable()
export class UserServiceClient implements OnModuleInit {
  private readonly logger = new Logger(UserServiceClient.name);

  /**
   * Base URL of user-service REST API.
   * Configured via USER_SERVICE_URL environment variable.
   */
  private readonly baseUrl: string;

  /**
   * TTL for the single-user in-memory cache (milliseconds).
   * 60 seconds is appropriate for user data that changes infrequently.
   */
  private readonly CACHE_TTL_MS = 60_000;

  /**
   * In-memory TTL cache: userId → { user, expiresAt }.
   * Prevents redundant HTTP calls for the same user within the TTL window.
   * For multi-instance deployments, replace with a Redis-backed cache.
   */
  private readonly cache = new Map<string, { user: ResolvedUser; expiresAt: number }>();

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>("USER_SERVICE_URL", "http://localhost:4001");
  }

  /**
   * Logs the configured user-service URL on module start.
   * Useful for verifying the correct URL is loaded from environment variables.
   *
   * @returns {void}
   */
  onModuleInit(): void {
    this.logger.log(`UserServiceClient → user-service at ${this.baseUrl}`);
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────

  /**
   * Resolves a single User by id, using the TTL cache when available.
   *
   * Cache hit path:  O(1) Map lookup, no HTTP call.
   * Cache miss path: HTTP GET /users/:id → cache result → return.
   *
   * @param {string} userId - UUID v4 of the user to resolve.
   * @returns {Promise<ResolvedUser | null>} The resolved User, or null if not found / unavailable.
   */
  async resolveOne(userId: string): Promise<ResolvedUser | null> {
    // Cache hit
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }

    // Cache miss — fetch from user-service
    const user = await this.fetchOne(userId);
    if (user) {
      this.cache.set(userId, { user, expiresAt: Date.now() + this.CACHE_TTL_MS });
    }
    return user;
  }

  /**
   * Resolves multiple Users in a single HTTP batch call.
   *
   * This is the primary method for REST list endpoints (GET /blogs).
   * For N blogs with potentially M unique authors, this issues exactly 1 HTTP
   * call to user-service, returning all authors at once — no N+1 problem.
   *
   * Algorithm:
   * 1. Deduplicate ids (a user may author multiple blogs in the result set).
   * 2. Partition into cache hits (no HTTP needed) and cache misses.
   * 3. Fetch all cache misses in one HTTP call using ?ids=id1,id2,...
   * 4. Populate cache with newly fetched users.
   * 5. Build and return a Map<userId, ResolvedUser | null> for O(1) lookup.
   *
   * @param {string[]} userIds - Array of user UUIDs to resolve (may contain duplicates).
   * @returns {Promise<Map<string, ResolvedUser | null>>} Map from userId to resolved User or null.
   */
  async resolveMany(userIds: string[]): Promise<Map<string, ResolvedUser | null>> {
    const result = new Map<string, ResolvedUser | null>();
    if (userIds.length === 0) return result;

    // Deduplicate ids — a single author may appear many times in a blog list
    const uniqueIds = [...new Set(userIds)];
    const uncachedIds: string[] = [];

    // Partition: serve cache hits immediately
    for (const id of uniqueIds) {
      const cached = this.cache.get(id);
      if (cached && cached.expiresAt > Date.now()) {
        result.set(id, cached.user);
      } else {
        uncachedIds.push(id);
      }
    }

    // Nothing left to fetch
    if (uncachedIds.length === 0) return result;

    // Batch fetch all uncached ids in one HTTP call
    const fetched = await this.fetchMany(uncachedIds);
    const now = Date.now();

    for (const id of uncachedIds) {
      const user = fetched.get(id) ?? null;
      result.set(id, user);
      if (user) {
        // Populate cache for future single-blog lookups
        this.cache.set(id, { user, expiresAt: now + this.CACHE_TTL_MS });
      }
    }

    return result;
  }

  // ── PRIVATE HTTP HELPERS ──────────────────────────────────────────────────

  /**
   * Fetches a single user from user-service REST API.
   * Applies a 5-second timeout via AbortController.
   * Returns null on any error (network failure, 404, 5xx) — callers receive
   * `author: null` rather than a failed response.
   *
   * @param {string} userId - UUID v4 of the user to fetch.
   * @returns {Promise<ResolvedUser | null>} The user data, or null on any error.
   */
  private async fetchOne(userId: string): Promise<ResolvedUser | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const response = await fetch(`${this.baseUrl}/users/${userId}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        this.logger.warn(`user-service returned ${response.status} for user ${userId}`);
        return null;
      }

      return (await response.json()) as ResolvedUser;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to fetch user ${userId} from user-service: ${message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetches multiple users from user-service in a single HTTP call.
   * Uses the batch endpoint `GET /users?ids=id1,id2,...` which user-service
   * handles as an array response. Falls back to individual fetches if the
   * batch endpoint is unavailable (see note below).
   *
   * NOTE: This requires `GET /users?ids=...` to be supported by user-service.
   * If user-service only supports `GET /users/:id`, `resolveMany` can fall
   * back to `Promise.all(ids.map(id => fetchOne(id)))` with concurrency
   * limiting — still far better than sequential N fetches.
   *
   * @param {string[]} ids - Array of unique user UUIDs to fetch (already deduplicated).
   * @returns {Promise<Map<string, ResolvedUser>>} Map of successfully fetched users.
   */
  private async fetchMany(ids: string[]): Promise<Map<string, ResolvedUser>> {
    const result = new Map<string, ResolvedUser>();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const idsParam = ids.join(",");
      const response = await fetch(`${this.baseUrl}/users?ids=${idsParam}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        this.logger.warn(
          `user-service batch fetch returned ${response.status} for ids=[${idsParam}] — falling back to individual fetches`,
        );
        // Graceful fallback: individual concurrent fetches with Promise.all
        clearTimeout(timeout);
        return this.fetchManyIndividually(ids);
      }

      const users = (await response.json()) as ResolvedUser[];
      for (const user of users) {
        result.set(user.id, user);
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Batch user fetch failed: ${message} — falling back to individual fetches`);
      clearTimeout(timeout);
      return this.fetchManyIndividually(ids);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fallback: fetches multiple users via concurrent individual HTTP calls.
   * Used when the batch endpoint is unavailable or returns a non-2xx status.
   * Uses Promise.allSettled so a single failure does not abort all other fetches.
   *
   * @param {string[]} ids - Array of unique user UUIDs to fetch.
   * @returns {Promise<Map<string, ResolvedUser>>} Map of successfully fetched users; failed ids are omitted.
   */
  private async fetchManyIndividually(ids: string[]): Promise<Map<string, ResolvedUser>> {
    const result = new Map<string, ResolvedUser>();

    const settlements = await Promise.allSettled(
      ids.map(async (id) => ({ id, user: await this.fetchOne(id) })),
    );

    for (const settlement of settlements) {
      if (settlement.status === "fulfilled" && settlement.value.user) {
        result.set(settlement.value.id, settlement.value.user);
      }
    }

    return result;
  }

  /**
   * Removes a single user from the TTL cache.
   * Called when a `user.updated` or `user.deleted` Kafka event is received,
   * ensuring stale data is not served after a user mutation.
   *
   * @param {string} userId - UUID of the user entry to evict.
   * @returns {void}
   */
  evictCache(userId: string): void {
    this.cache.delete(userId);
    this.logger.debug(`Cache evicted for user ${userId}`);
  }

  /**
   * Clears the entire user cache.
   * Useful for testing or when a mass user update is detected.
   *
   * @returns {void}
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug("User cache cleared");
  }
}
