import { Injectable } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { UserRepository } from './user.repository.interface';

/**
 * @repository InMemoryUserRepository
 * @implements UserRepository
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
   * In-memory store.
   * Private — no code outside this class touches the Map directly.
   */
  private readonly store: Map<string, User> = new Map();

  async create(user: User): Promise<User> {
    this.store.set(user.id, user);
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.store.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  async findAll(): Promise<User[]> {
    return Array.from(this.store.values());
  }

  async update(id: string, data: Partial<Pick<User, 'name' | 'email'>>): Promise<User> {
    const existing = this.store.get(id);
    if (!existing) {
      // This should never be called without prior existence check in the service.
      throw new Error(`InMemoryUserRepository: User "${id}" not found during update`);
    }
    const updated: User = { ...existing, ...data };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
