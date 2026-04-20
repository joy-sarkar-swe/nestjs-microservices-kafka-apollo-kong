import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { KafkaEvent } from "../common/kafka/kafka-event.interface";
import { User } from "../users/entities/user.entity";

/**
 * @gateway UserEventsGateway
 * @description Socket.IO gateway for pushing user domain events to REST clients.
 *
 * Separation of concerns
 * ──────────────────────
 * This gateway is ONLY a push channel. It never handles incoming messages
 * from clients (no @SubscribeMessage decorators). REST clients connect once
 * and receive events whenever the Kafka consumer fires.
 *
 * Event flow (Pattern B)
 * ──────────────────────
 * 1. REST mutation → UsersService → publish KafkaEvent to Kafka topic
 * 2. UsersKafkaController consumes the event (after "DB" write)
 * 3. Controller calls gateway.emitUserCreated(event) / emitUserUpdated / emitUserDeleted
 * 4. Gateway broadcasts to all connected Socket.IO clients
 *
 * Socket.IO events emitted
 * ──────────────────────────
 *   user:created  — payload: KafkaEvent<User>
 *   user:updated  — payload: KafkaEvent<User>
 *   user:deleted  — payload: KafkaEvent<{ id: string }>
 *
 * Client connection (JavaScript)
 * ───────────────────────────────
 *   const socket = io('http://localhost:4001');
 *   socket.on('user:created', (event) => console.log('New user:', event.payload));
 *   socket.on('user:updated', (event) => console.log('Updated user:', event.payload));
 *   socket.on('user:deleted', (event) => console.log('Deleted user id:', event.payload.id));
 *
 * CORS
 * ─────
 * origin: '*' is acceptable for local demo. Lock down to specific origins in production.
 */
@WebSocketGateway({
  cors: { origin: "*" },
  namespace: "/users",
  transports: ["websocket", "polling"],
})
export class UserEventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server: Server;

  private readonly logger = new Logger(UserEventsGateway.name);

  /**
   * Called once by the NestJS WebSocket framework after the Socket.IO server
   * has been initialised and is ready to accept connections.
   *
   * @returns {void}
   */
  afterInit(): void {
    this.logger.log(
      "UserEventsGateway initialised — Socket.IO /users namespace ready",
    );
  }

  /**
   * Called each time a new Socket.IO client connects to the `/users` namespace.
   *
   * @param {Socket} client - The connecting Socket.IO client socket.
   * @returns {void}
   */
  handleConnection(client: Socket): void {
    this.logger.log(`Socket.IO client connected: ${client.id}`);
  }

  /**
   * Called each time a Socket.IO client disconnects from the `/users` namespace.
   *
   * @param {Socket} client - The disconnecting Socket.IO client socket.
   * @returns {void}
   */
  handleDisconnect(client: Socket): void {
    this.logger.log(`Socket.IO client disconnected: ${client.id}`);
  }

  /**
   * Broadcasts a `user:created` event to all connected REST clients.
   * Called by UsersKafkaController after the in-memory write succeeds.
   *
   * @param {KafkaEvent<User>} event - The full KafkaEvent envelope including correlationId and User payload.
   * @returns {void}
   */
  emitUserCreated(event: KafkaEvent<User>): void {
    this.server.emit("user:created", event);
    this.logger.log(
      `[user:created] broadcast — correlationId=${event.correlationId}`,
    );
  }

  /**
   * Broadcasts a `user:updated` event to all connected REST clients.
   * Called by UsersKafkaController after processing a user.updated Kafka event.
   *
   * @param {KafkaEvent<User>} event - The full KafkaEvent envelope including correlationId and updated User payload.
   * @returns {void}
   */
  emitUserUpdated(event: KafkaEvent<User>): void {
    this.server.emit("user:updated", event);
    this.logger.log(
      `[user:updated] broadcast — correlationId=${event.correlationId}`,
    );
  }

  /**
   * Broadcasts a `user:deleted` event to all connected REST clients.
   * Called by UsersKafkaController after processing a user.deleted Kafka event.
   *
   * @param {KafkaEvent<{ id: string }>} event - The full KafkaEvent envelope with the deleted user's id.
   * @returns {void}
   */
  emitUserDeleted(event: KafkaEvent<{ id: string }>): void {
    this.server.emit("user:deleted", event);
    this.logger.log(
      `[user:deleted] broadcast — correlationId=${event.correlationId}`,
    );
  }
}
