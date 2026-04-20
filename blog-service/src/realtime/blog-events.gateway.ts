import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Blog } from "../blogs/entities/blog.entity";
import { KafkaEvent } from "../common/kafka/kafka-event.interface";

/**
 * @gateway BlogEventsGateway
 * @description Socket.IO gateway for pushing blog domain events to REST clients.
 *
 * Push-only — no incoming message handlers (@SubscribeMessage decorators).
 * REST clients connect once and passively receive events whenever the Kafka
 * consumer fires after a mutation.
 *
 * Namespace: /blogs
 *
 * Event flow (Pattern B)
 * ──────────────────────
 * 1. REST/GraphQL mutation → BlogsService → publish KafkaEvent to Kafka
 * 2. BlogsKafkaController consumes the event (after repository write)
 * 3. Controller calls gateway.emitBlogCreated / Updated / Deleted
 * 4. Gateway broadcasts to all connected Socket.IO clients on /blogs
 *
 * Socket.IO events emitted
 * ──────────────────────────
 *   blog:created — KafkaEvent<Blog>
 *   blog:updated — KafkaEvent<Blog>
 *   blog:deleted — KafkaEvent<{ id: string, reason?, authorId? }>
 *
 * Client connection
 * ──────────────────
 *   const socket = io('http://localhost:4002/blogs');
 *   socket.on('blog:created', (event) => console.log('New blog:', event.payload));
 *   socket.on('blog:updated', (event) => console.log('Updated blog:', event.payload));
 *   socket.on('blog:deleted', (event) => console.log('Deleted blog id:', event.payload.id));
 *
 * CORS
 * ─────
 * origin: '*' is acceptable for local demo. Restrict to specific origins in production.
 */
@WebSocketGateway({
  cors: { origin: "*" },
  namespace: "/blogs",
  transports: ["websocket", "polling"],
})
export class BlogEventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server: Server;

  private readonly logger = new Logger(BlogEventsGateway.name);

  /**
   * Called once by the NestJS WebSocket framework after the Socket.IO server
   * has been initialised and is ready to accept connections on the /blogs namespace.
   *
   * @returns {void}
   */
  afterInit(): void {
    this.logger.log(
      "BlogEventsGateway initialised — Socket.IO /blogs namespace ready",
    );
  }

  /**
   * Called each time a new Socket.IO client connects to the `/blogs` namespace.
   *
   * @param {Socket} client - The connecting Socket.IO client socket.
   * @returns {void}
   */
  handleConnection(client: Socket): void {
    this.logger.log(`Socket.IO client connected: ${client.id}`);
  }

  /**
   * Called each time a Socket.IO client disconnects from the `/blogs` namespace.
   *
   * @param {Socket} client - The disconnecting Socket.IO client socket.
   * @returns {void}
   */
  handleDisconnect(client: Socket): void {
    this.logger.log(`Socket.IO client disconnected: ${client.id}`);
  }

  /**
   * Broadcasts a `blog:created` event to all connected REST clients.
   * Called by BlogsKafkaController after processing a blog.created Kafka event.
   *
   * @param {KafkaEvent<Blog>} event - Full KafkaEvent envelope with correlationId and Blog payload.
   * @returns {void}
   */
  emitBlogCreated(event: KafkaEvent<Blog>): void {
    this.server.emit("blog:created", event);
    this.logger.log(
      `[blog:created] broadcast — correlationId=${event.correlationId}`,
    );
  }

  /**
   * Broadcasts a `blog:updated` event to all connected REST clients.
   * Called by BlogsKafkaController after processing a blog.updated Kafka event.
   *
   * @param {KafkaEvent<Blog>} event - Full KafkaEvent envelope with correlationId and updated Blog payload.
   * @returns {void}
   */
  emitBlogUpdated(event: KafkaEvent<Blog>): void {
    this.server.emit("blog:updated", event);
    this.logger.log(
      `[blog:updated] broadcast — correlationId=${event.correlationId}`,
    );
  }

  /**
   * Broadcasts a `blog:deleted` event to all connected REST clients.
   * Called by BlogsKafkaController after processing a blog.deleted Kafka event.
   * The payload contains the deleted blog's id (and optionally a deletion reason).
   *
   * @param {KafkaEvent<{ id: string }>} event - Full KafkaEvent envelope with the deleted blog id.
   * @returns {void}
   */
  emitBlogDeleted(event: KafkaEvent<{ id: string }>): void {
    this.server.emit("blog:deleted", event);
    this.logger.log(
      `[blog:deleted] broadcast — correlationId=${event.correlationId}`,
    );
  }
}
