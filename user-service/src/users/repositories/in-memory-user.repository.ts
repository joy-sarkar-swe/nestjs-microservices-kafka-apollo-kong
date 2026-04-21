import { Injectable } from "@nestjs/common";
import { User } from "../entities/user.entity.js";
import { UserRepository } from "./user.repository.interface.js";

/**
 * @repository InMemoryUserRepository
 * @implements {UserRepository}
 * @description Concrete in-memory implementation of UserRepository.
 *
 * Storage backend: `Map<string, User>` — keyed by UUID.
 * State is lost on process restart, which is acceptable for the current demo.
 *
 * Upgrade path
 * ────────────
 * When a real DB is introduced, create a new class (e.g. PrismaUserRepository)
 * that implements UserRepository, then change ONE line in UsersModule:
 *   { provide: 'USER_REPOSITORY', useClass: PrismaUserRepository }
 * UsersService requires zero changes.
 *
 * Why @Injectable()?
 * ──────────────────
 * NestJS DI manages the lifecycle (singleton by default). Marking it
 * @Injectable() allows it to receive its own dependencies in the future
 * (e.g. @InjectRepository(UserEntity) for TypeORM, PrismaService for Prisma).
 */
@Injectable()
export class InMemoryUserRepository implements UserRepository {
  /**
   * In-memory store keyed by user UUID.
   * Private — no code outside this class touches the Map directly.
   * Replaced by a real DB connection (e.g. Prisma client) in production.
   */
  private readonly store: Map<string, User> = new Map();

  /**
   * Persists a new User record to the in-memory store.
   *
   * @param {User} user - The fully constructed User entity (id already assigned).
   * @returns {Promise<User>} The stored User, identical to the input for in-memory storage.
   */
  async create(user: User): Promise<User> {
    this.store.set(user.id, user);
    return user;
  }

  /**
   * Retrieves a User by their UUID primary key.
   *
   * @param {string} id - UUID v4 of the target user.
   * @returns {Promise<User | null>} The matching User, or null if not found.
   */
  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }

  /**
   * Scans the store for a User whose email matches exactly.
   * Used by UsersService to enforce email uniqueness before create/update.
   *
   * @param {string} email - The exact email address to search for.
   * @returns {Promise<User | null>} The matching User, or null if no match exists.
   */
  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.store.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  /**
   * Returns all stored User records as an array.
   *
   * @returns {Promise<User[]>} All users; possibly an empty array.
   */
  async findAll(): Promise<User[]> {
    return Array.from(this.store.values());
  }

  /**
   * Applies a partial update to an existing User record.
   * Merges only the fields present in `data`; all other fields are preserved.
   *
   * @param {string} id - UUID of the User to update.
   * @param {Partial<Pick<User, 'name' | 'email'>>} data - The fields to overwrite.
   * @returns {Promise<User>} The fully merged, updated User record.
   * @throws {Error} If the id does not exist in the store (should be pre-checked by the service).
   */
  async update(id: string, data: Partial<Pick<User, "name" | "email">>): Promise<User> {
    const existing = this.store.get(id);
    if (!existing) {
      // This should never be called without prior existence check in the service.
      throw new Error(`InMemoryUserRepository: User "${id}" not found during update`);
    }
    const updated: User = { ...existing, ...data };
    this.store.set(id, updated);
    return updated;
  }

  /**
   * Removes a User from the in-memory store by UUID.
   * A no-op if the id does not exist (Map.delete is safe on missing keys).
   *
   * @param {string} id - UUID of the User to remove.
   * @returns {Promise<void>}
   */
  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
