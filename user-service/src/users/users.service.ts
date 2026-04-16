import {
  Injectable,
  NotFoundException,
  ConflictException,
  OnModuleInit,
} from '@nestjs/common';
import { Client, ClientKafka, Transport } from '@nestjs/microservices';
import { v4 as uuidv4 } from 'uuid';
import { User } from './entities/user.entity';
import { CreateUserInput, UpdateUserInput, DeleteUserInput } from './dto/user.input';

/**
 * @service UsersService
 * @description Core business logic for user CRUD.
 *
 * Responsibility boundary
 * -----------------------
 * This service operates on plain domain objects (User).
 * It throws NestJS HTTP exceptions (NotFoundException, ConflictException)
 * on failure — it does NOT construct ApiResponse objects.
 * Response wrapping is the resolver's responsibility via ResponseFactory.
 *
 * This separation keeps the service layer:
 *   • Testable independently of GraphQL
 *   • Reusable from REST controllers
 *   • Free of presentation-layer concerns
 *
 * Storage:  in-memory Map<UUID, User>
 * Events:   Kafka producer — user.created | user.updated | user.deleted
 */
@Injectable()
export class UsersService implements OnModuleInit {
  /**
   * @property kafkaClient
   * Inline Kafka producer client.
   * allowAutoTopicCreation avoids manual topic pre-creation in dev.
   */
  @Client({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'user-service-producer',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      },
      producer: {
        allowAutoTopicCreation: true,
      },
    },
  })
  private kafkaClient: ClientKafka;

  /** In-memory store — keyed by UUID. */
  private readonly users: Map<string, User> = new Map();

  /**
   * @lifecycle onModuleInit
   * Connect the Kafka producer before the first request arrives.
   */
  async onModuleInit(): Promise<void> {
    await this.kafkaClient.connect();
  }

  // ── READ ──────────────────────────────────────────────────────────────────

  /**
   * Returns all users.
   * @returns {User[]} Possibly empty array.
   */
  findAll(): User[] {
    return Array.from(this.users.values());
  }

  /**
   * Returns a single user by UUID.
   * @throws {NotFoundException} 404 when id is not found.
   */
  findOne(id: string): User {
    const user = this.users.get(id);
    if (!user) {
      throw new NotFoundException(`User with id "${id}" was not found`);
    }
    return user;
  }

  // ── CREATE ────────────────────────────────────────────────────────────────

  /**
   * Creates a new user and emits `user.created` on Kafka.
   *
   * @throws {ConflictException} 409 when email is already registered.
   *
   * Flow: guard → build → persist → emit → return
   */
  async create(input: CreateUserInput): Promise<User> {
    const emailExists = Array.from(this.users.values()).some(
      (u) => u.email === input.email,
    );
    if (emailExists) {
      throw new ConflictException(
        `Email "${input.email}" is already registered`,
      );
    }

    const user: User = {
      id: uuidv4(),
      name: input.name,
      email: input.email,
    };

    this.users.set(user.id, user);
    this.publish('user.created', user);
    return user;
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────

  /**
   * Partially updates a user and emits `user.updated` on Kafka.
   *
   * @throws {NotFoundException}  404 when id is not found.
   * @throws {ConflictException}  409 when new email is already taken.
   *
   * Flow: resolve → guard → merge → persist → emit → return
   */
  async update(input: UpdateUserInput): Promise<User> {
    const existing = this.findOne(input.id); // throws 404

    if (input.email && input.email !== existing.email) {
      const emailTaken = Array.from(this.users.values()).some(
        (u) => u.email === input.email && u.id !== input.id,
      );
      if (emailTaken) {
        throw new ConflictException(
          `Email "${input.email}" is already registered`,
        );
      }
    }

    const updated: User = {
      ...existing,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.email !== undefined && { email: input.email }),
    };

    this.users.set(updated.id, updated);
    this.publish('user.updated', updated);
    return updated;
  }

  // ── DELETE ────────────────────────────────────────────────────────────────

  /**
   * Removes a user and emits `user.deleted` on Kafka.
   * blog-service listens to `user.deleted` and removes orphaned posts.
   *
   * @throws {NotFoundException} 404 when id is not found.
   */
  async delete(input: DeleteUserInput): Promise<void> {
    this.findOne(input.id); // throws 404
    this.users.delete(input.id);
    this.publish('user.deleted', { id: input.id });
  }

  // ── FEDERATION ────────────────────────────────────────────────────────────

  /**
   * Apollo Federation entity resolver.
   * Called by Apollo Router when blog-service returns a User { id } reference
   * and the client requests additional User fields.
   *
   * @param {{ id: string }} reference - Minimal entity reference from Router.
   * @returns {User} Fully populated User record.
   * @throws {NotFoundException} If the referenced user no longer exists.
   */
  resolveReference(reference: { id: string }): User {
    return this.findOne(reference.id);
  }

  // ── KAFKA ─────────────────────────────────────────────────────────────────

  /**
   * Fire-and-forget Kafka event emission.
   * Uses entity id as the message key for consistent partition routing.
   */
  private publish(topic: string, payload: object): void {
    const key = (payload as any).id ?? 'unknown';
    this.kafkaClient.emit(topic, {
      key,
      value: JSON.stringify(payload),
    });
  }
}
