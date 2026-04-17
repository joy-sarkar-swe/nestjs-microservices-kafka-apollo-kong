import { User } from '../entities/user.entity';

/**
 * @interface UserRepository
 * @description Persistence contract for user storage.
 *
 * Services depend ONLY on this interface — never on a concrete implementation.
 * This enforces the Dependency Inversion Principle and makes swapping the
 * storage backend a zero-change operation in UsersService.
 *
 * Injection token
 * ───────────────
 * Use the string token 'USER_REPOSITORY' everywhere:
 *   @Inject('USER_REPOSITORY') private readonly repo: UserRepository
 *
 * Adding a new implementation
 * ───────────────────────────
 * 1. Create the class (e.g. PrismaUserRepository, MongooseUserRepository)
 * 2. Implement every method on this interface
 * 3. Register it in UsersModule providers:
 *      { provide: 'USER_REPOSITORY', useClass: PrismaUserRepository }
 * 4. Zero changes in UsersService — it still talks to 'USER_REPOSITORY'
 *
 * Current implementations
 * ───────────────────────
 *   InMemoryUserRepository  — Map<string, User>  (this project)
 *   PrismaUserRepository    — Prisma ORM          (add when ready)
 *   TypeOrmUserRepository   — TypeORM             (add when ready)
 *   MongooseUserRepository  — Mongoose            (add when ready)
 */
export interface UserRepository {
  /**
   * Persist a new User record.
   * The id field is already assigned before calling this method.
   * @param user - The complete User entity to store.
   * @returns The stored User (may differ from input if DB sets defaults).
   */
  create(user: User): Promise<User>;

  /**
   * Find a User by primary key.
   * @param id - UUID v4
   * @returns The User if found, null otherwise.
   */
  findById(id: string): Promise<User | null>;

  /**
   * Find a User by email address.
   * Used for uniqueness checks before creating/updating.
   * @param email - Exact email to search.
   * @returns The User if found, null otherwise.
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Return every stored User.
   * @returns Possibly empty array.
   */
  findAll(): Promise<User[]>;

  /**
   * Apply a partial update to an existing User.
   * The implementation merges only the provided fields.
   * @param id   - UUID of the User to update.
   * @param data - Partial User fields to overwrite.
   * @returns The fully updated User record.
   */
  update(id: string, data: Partial<Pick<User, 'name' | 'email'>>): Promise<User>;

  /**
   * Remove a User from the store.
   * @param id - UUID of the User to delete.
   * @returns void — no content on success.
   */
  delete(id: string): Promise<void>;
}
