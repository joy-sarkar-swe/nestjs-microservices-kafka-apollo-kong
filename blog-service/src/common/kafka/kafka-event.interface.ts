/**
 * @file kafka-event.interface.ts  (blog-service)
 * @description Typed Kafka message envelope — identical contract to user-service.
 *
 * Each service owns its own copy (no shared library across service boundaries).
 * Both must stay in sync on the `version` field.
 */
export interface KafkaEvent<T = unknown> {
  correlationId: string;
  eventType: string;
  version: number;
  timestamp: string;
  payload: T;
}
