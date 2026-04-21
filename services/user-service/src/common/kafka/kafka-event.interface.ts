/**
 * @file kafka-event.interface.ts
 * @description Typed Kafka message envelope used by ALL producers and consumers.
 *
 * Every message on every topic MUST be wrapped in this envelope.
 * This enables:
 *   - Correlation tracking across the request → Kafka → consumer → realtime chain
 *   - Schema versioning (bump `version` on breaking payload changes)
 *   - Idempotency (consumers deduplicate on `correlationId`)
 *   - Structured logging (every log line can reference correlationId)
 *   - Dead-letter routing (DLQ messages carry original envelope intact)
 *
 * Wire format: JSON string
 *   {
 *     "correlationId": "uuid-v4",
 *     "eventType":     "user.created",
 *     "version":       1,
 *     "timestamp":     "2025-04-17T10:00:00.000Z",
 *     "payload":       { ...domain object... }
 *   }
 */
export interface KafkaEvent<T = unknown> {
  /**
   * UUID v4 generated at the API layer for each operation.
   * Consumers use this to detect and skip duplicate deliveries.
   * Passed to realtime events so clients can correlate subscription
   * updates back to the original mutation that triggered them.
   */
  correlationId: string;

  /**
   * Canonical event type string — mirrors the Kafka topic name.
   * e.g. "user.created" | "user.updated" | "user.deleted"
   * Allows a single consumer to handle multiple topics via a switch.
   */
  eventType: string;

  /**
   * Schema version. Start at 1.
   * Bump when the payload shape changes in a breaking way.
   * Consumers can ignore events with unknown versions gracefully.
   */
  version: number;

  /**
   * ISO 8601 timestamp set by the producer at emit time.
   * Distinct from the response `timestamp` — this is when Kafka received it.
   */
  timestamp: string;

  /**
   * The domain payload. Typed per-event via the generic parameter T.
   * e.g. KafkaEvent<User>, KafkaEvent<{ id: string }>
   */
  payload: T;
}
