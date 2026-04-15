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
 * Storage
 * -------
 * Uses an in-memory `Map<id, User>` — no database required for this demo.
 * State is lost on restart, which is acceptable for lecture purposes.
 *
 * Kafka integration
 * -----------------
 * After every mutation the service **emits** (fire-and-forget) a domain event
 * so other services (e.g. blog-service cleaning up orphaned posts) can react
 * asynchronously without tight coupling.
 *
 * Topics emitted
 * ├─ user.created  — full User payload
 * ├─ user.updated  — full User payload
 * └─ user.deleted  — { id } payload
 */
@Injectable()
export class UsersService implements OnModuleInit {
  /**
   * @property kafkaClient
   * Inline Kafka **producer** client owned by this service.
   * Using @Client() decorator keeps the producer configuration co-located
   * with the service that needs it (vs a separate module-level registration).
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
   * Connect the Kafka producer before any mutations are handled.
   * NestJS guarantees this runs before the first request reaches controllers.
   */
  async onModuleInit(): Promise<void> {
    await this.kafkaClient.connect();
  }

  // ── READ ─────────────────────────────────────────────────────────────────

  /**
   * Returns every user currently in the store.
   * @returns {User[]} Possibly empty array.
   */
  findAll(): User[] {
    return Array.from(this.users.values());
  }

  /**
   * Returns a single user by UUID.
   * @throws {NotFoundException} When the id is not found.
   */
  findOne(id: string): User {
    const user = this.users.get(id);
    if (!user) {
      throw new NotFoundException(`User "${id}" not found`);
    }
    return user;
  }

  // ── CREATE ────────────────────────────────────────────────────────────────

  /**
   * Creates a new user and emits `user.created` on Kafka.
   *
   * @throws {ConflictException} If the email is already registered.
   *
   * Flow
   * 1. Guard: check email uniqueness
   * 2. Build record with uuid()
   * 3. Persist to Map
   * 4. Emit `user.created`
   * 5. Return the record
   */
  async create(input: CreateUserInput): Promise<User> {
    const emailExists = Array.from(this.users.values()).some(
      (u) => u.email === input.email,
    );
    if (emailExists) {
      throw new ConflictException(`Email "${input.email}" is already registered`);
    }

    const user: User = {
      id: uuidv4(),
      name: input.name,
      email: input.email,
    };

    this.users.set(user.id, user);
    this.emit('user.created', user);
    return user;
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────

  /**
   * Partially updates an existing user and emits `user.updated` on Kafka.
   *
   * @throws {NotFoundException}  Unknown id.
   * @throws {ConflictException}  New email already taken by another user.
   *
   * Flow
   * 1. Resolve existing record
   * 2. Guard: email uniqueness if email changed
   * 3. Merge changed fields (undefined fields left untouched)
   * 4. Persist updated record
   * 5. Emit `user.updated`
   * 6. Return updated record
   */
  async update(input: UpdateUserInput): Promise<User> {
    const existing = this.findOne(input.id);

    if (input.email && input.email !== existing.email) {
      const taken = Array.from(this.users.values()).some(
        (u) => u.email === input.email && u.id !== input.id,
      );
      if (taken) {
        throw new ConflictException(`Email "${input.email}" is already registered`);
      }
    }

    const updated: User = {
      ...existing,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.email !== undefined && { email: input.email }),
    };

    this.users.set(updated.id, updated);
    this.emit('user.updated', updated);
    return updated;
  }

  // ── DELETE ────────────────────────────────────────────────────────────────

  /**
   * Removes a user and emits `user.deleted` on Kafka.
   * blog-service listens to `user.deleted` and removes orphaned posts.
   *
   * @throws {NotFoundException} Unknown id.
   * @returns {boolean} Always `true` on success.
   */
  async delete(input: DeleteUserInput): Promise<boolean> {
    this.findOne(input.id); // throws if not found
    this.users.delete(input.id);
    this.emit('user.deleted', { id: input.id });
    return true;
  }

  // ── FEDERATION ────────────────────────────────────────────────────────────

  /**
   * Apollo Federation entity resolver.
   * Apollo Router calls this when another subgraph returns a `User { id }`
   * reference and the query requests additional User fields.
   *
   * @param {{ id: string }} reference - The partial entity from the Router.
   * @returns {User} Fully populated User record.
   */
  resolveReference(reference: { id: string }): User {
    return this.findOne(reference.id);
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────

  /**
   * Fire-and-forget Kafka emit helper.
   * Sets a string key equal to the entity id so Kafka partitions consistently.
   */
  private emit(topic: string, payload: object): void {
    const id = (payload as any).id ?? 'unknown';
    this.kafkaClient.emit(topic, {
      key: id,
      value: JSON.stringify(payload),
    });
  }
}
