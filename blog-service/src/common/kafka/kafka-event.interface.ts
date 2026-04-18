/**
 * @file kafka-event.interface.ts  (blog-service)
 * @description Typed Kafka message envelope — identical contract to user-service.
 *
 * Each service owns its own copy (no shared library across service boundaries).
 * Both must stay in sync on the `version` field when payload shapes change.
 *
 * Wire format: JSON string
 *   {
 *     "correlationId": "uuid-v4",
 *     "eventType":     "blog.created",
 *     "version":       1,
 *     "timestamp":     "2025-04-17T10:00:00.000Z",
 *     "payload":       { ...domain object... }
 *   }
 */
export interface KafkaEvent<T = unknown> {
  /**
   * UUID v4 generated at the API layer for each operation.
   * Consumers use this to detect and skip duplicate deliveries (idempotency).
   * Also carried in Socket.IO events so REST clients can correlate pushes
   * back to the original mutation that triggered them.
   */
  correlationId: string;

  /**
   * Canonical event type string — mirrors the Kafka topic name exactly.
   * e.g. "blog.created" | "blog.updated" | "blog.deleted"
   */
  eventType: string;

  /**
   * Schema version. Starts at 1.
   * Increment when the payload shape changes in a breaking way.
   * Consumers can ignore events with unknown versions gracefully.
   */
  version: number;

  /**
   * ISO 8601 timestamp set by the producer at emit time.
   * Represents when the event entered Kafka, not when the entity was modified.
   */
  timestamp: string;

  /**
   * The domain-specific payload.
   * Typed per-event via the generic parameter T.
   * e.g. KafkaEvent<Blog>, KafkaEvent<{ id: string }>
   */
  payload: T;
}
