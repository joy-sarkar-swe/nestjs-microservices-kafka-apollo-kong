import {
  Injectable,
  NotFoundException,
  ConflictException,
  OnModuleInit,
  Inject,
} from "@nestjs/common";
import { Client, ClientKafka, Transport } from "@nestjs/microservices";
import { v4 as uuidv4 } from "uuid";
import { User } from "./entities/user.entity";
import { CreateUserInput, UpdateUserInput, DeleteUserInput } from "./dto/user.input";
import { UserRepository } from "./repositories/user.repository.interface";
import { KafkaEvent } from "../common/kafka/kafka-event.interface";

/**
 * @service UsersService
 * @description Orchestrates user CRUD operations.
 *
 * Dependency Inversion
 * ─────────────────────
 * This service depends on the `UserRepository` INTERFACE, not any concrete
 * implementation. It has zero knowledge of Maps, Prisma, TypeORM, or Mongoose.
 * Swapping the storage backend is a single-line change in UsersModule.
 *
 * Responsibility boundary
 * ─────────────────────────
 * 1. Validate business rules (uniqueness, existence)
 * 2. Delegate storage to UserRepository
 * 3. Publish typed KafkaEvent<T> envelopes after every mutation
 * 4. Return plain domain objects — response wrapping is the resolver's job
 *
 * Kafka events
 * ─────────────
 * Every mutation emits a KafkaEvent envelope with:
 *   - correlationId (UUID v4, generated here — one per operation)
 *   - eventType     (mirrors topic name)
 *   - version       (schema version, start at 1)
 *   - timestamp     (ISO 8601, producer-side clock)
 *   - payload       (typed domain object)
 *
 * The consumer layer (UsersKafkaController + RealtimeGateway) uses the
 * correlationId to push real-time updates to connected clients.
 */
@Injectable()
export class UsersService implements OnModuleInit {
  /**
   * Kafka producer client.
   * Producer config: allowAutoTopicCreation ensures topics are created
   * on first emit without manual CLI setup.
   */
  @Client({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: "user-service-producer",
        brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
      },
      producer: {
        allowAutoTopicCreation: true,
      },
    },
  })
  private kafkaClient: ClientKafka;

  /**
   * @param repo - Injected via 'USER_REPOSITORY' token.
   * The concrete class is determined by UsersModule providers — this service
   * never imports InMemoryUserRepository or any DB-specific class.
   */
  constructor(
    @Inject("USER_REPOSITORY")
    private readonly repo: UserRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaClient.connect();
  }

  // ── READ ──────────────────────────────────────────────────────────────────

  async findAll(): Promise<User[]> {
    return this.repo.findAll();
  }

  /**
   * @throws {NotFoundException} 404 when no user exists with the given id.
   */
  async findOne(id: string): Promise<User> {
    const user = await this.repo.findById(id);
    if (!user) {
      throw new NotFoundException(`User with id "${id}" was not found`);
    }
    return user;
  }

  // ── CREATE ────────────────────────────────────────────────────────────────

  /**
   * Flow: guard email uniqueness → build entity → persist → emit → return
   * @throws {ConflictException} 409 when email is already registered.
   */
  async create(input: CreateUserInput): Promise<User> {
    const existing = await this.repo.findByEmail(input.email);
    if (existing) {
      throw new ConflictException(`Email "${input.email}" is already registered`);
    }

    const user: User = {
      id: uuidv4(),
      name: input.name,
      email: input.email,
    };

    const saved = await this.repo.create(user);

    this.publish<User>("user.created", saved);
    return saved;
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────

  /**
   * Flow: resolve existing → guard email uniqueness → persist → emit → return
   * @throws {NotFoundException}  404 when id is not found.
   * @throws {ConflictException}  409 when new email is already taken.
   */
  async update(input: UpdateUserInput): Promise<User> {
    const existing = await this.findOne(input.id); // throws 404

    if (input.email && input.email !== existing.email) {
      const emailOwner = await this.repo.findByEmail(input.email);
      if (emailOwner && emailOwner.id !== input.id) {
        throw new ConflictException(`Email "${input.email}" is already registered`);
      }
    }

    const patch: Partial<Pick<User, "name" | "email">> = {};
    if (input.name  !== undefined) patch.name  = input.name;
    if (input.email !== undefined) patch.email = input.email;

    const updated = await this.repo.update(input.id, patch);

    this.publish<User>("user.updated", updated);
    return updated;
  }

  // ── DELETE ────────────────────────────────────────────────────────────────

  /**
   * Flow: verify existence → delete → emit
   * @throws {NotFoundException} 404 when id is not found.
   */
  async delete(input: DeleteUserInput): Promise<void> {
    await this.findOne(input.id); // throws 404
    await this.repo.delete(input.id);
    this.publish<{ id: string }>("user.deleted", { id: input.id });
  }

  // ── FEDERATION ────────────────────────────────────────────────────────────

  /**
   * Called by Apollo Router for cross-service entity resolution.
   * Returns raw User — no response wrapping.
   */
  async resolveReference(reference: { id: string }): Promise<User> {
    return this.findOne(reference.id);
  }

  // ── KAFKA ─────────────────────────────────────────────────────────────────

  /**
   * @method publish
   * Wraps payload in a KafkaEvent envelope and emits fire-and-forget.
   *
   * Envelope fields:
   *   correlationId — fresh UUID per call; consumers use this for idempotency
   *                   and to push realtime notifications back to the right client
   *   eventType     — mirrors the topic name exactly
   *   version       — schema version; bump on breaking payload changes
   *   timestamp     — producer-side ISO 8601 clock
   *   payload       — typed domain object
   *
   * Kafka message key = entity id → consistent partition routing,
   * ensuring all events for the same entity are ordered on the same partition.
   */
  private publish<T extends { id?: string }>(topic: string, payload: T): void {
    const event: KafkaEvent<T> = {
      correlationId: uuidv4(),
      eventType:     topic,
      version:       1,
      timestamp:     new Date().toISOString(),
      payload,
    };

    this.kafkaClient.emit(topic, {
      key:   (payload as any).id ?? "unknown",
      value: JSON.stringify(event),
    });
  }
}
