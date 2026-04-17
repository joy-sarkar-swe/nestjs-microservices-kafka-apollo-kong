import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { KafkaEvent } from '../common/kafka/kafka-event.interface';
import { Blog } from '../blogs/entities/blog.entity';

/**
 * @gateway BlogEventsGateway
 * @description Socket.IO gateway for pushing blog domain events to REST clients.
 *
 * Push-only — no incoming message handlers.
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
 */
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/blogs',
  transports: ['websocket', 'polling'],
})
export class BlogEventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server: Server;

  private readonly logger = new Logger(BlogEventsGateway.name);

  afterInit(server: Server): void {
    this.logger.log('BlogEventsGateway initialised — Socket.IO /blogs namespace ready');
  }

  handleConnection(client: Socket): void {
    this.logger.log(`Socket.IO client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Socket.IO client disconnected: ${client.id}`);
  }

  emitBlogCreated(event: KafkaEvent<Blog>): void {
    this.server.emit('blog:created', event);
    this.logger.log(`[blog:created] broadcast — correlationId=${event.correlationId}`);
  }

  emitBlogUpdated(event: KafkaEvent<Blog>): void {
    this.server.emit('blog:updated', event);
    this.logger.log(`[blog:updated] broadcast — correlationId=${event.correlationId}`);
  }

  emitBlogDeleted(event: KafkaEvent<{ id: string }>): void {
    this.server.emit('blog:deleted', event);
    this.logger.log(`[blog:deleted] broadcast — correlationId=${event.correlationId}`);
  }
}
