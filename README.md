# NestJS Microservices — Repository Pattern + Pattern B Realtime

> Apollo Federation v2 · Kafka Pub/Sub · Repository Pattern · GraphQL Subscriptions · Socket.IO

---

## What changed from the previous version

| Area                   | Before               | After                                                              |
| ---------------------- | -------------------- | ------------------------------------------------------------------ |
| **Persistence**        | `Map` inside service | `InMemoryXxxRepository` behind interface                           |
| **Service dependency** | `new Map()` directly | `@Inject('XXX_REPOSITORY') repo: XxxRepository`                    |
| **Kafka envelope**     | Raw JSON payload     | Typed `KafkaEvent<T>` with `correlationId`, `version`, `timestamp` |
| **Idempotency**        | None                 | `processedCorrelationIds: Set<string>` (capped at 10 000)          |
| **Dead-letter queue**  | None                 | `user.events.dlq` / `blog.events.dlq` topics                       |
| **GraphQL real-time**  | None                 | 3 `@Subscription` per service via `graphql-ws`                     |
| **REST real-time**     | None                 | Socket.IO gateway per service (`/users`, `/blogs` namespaces)      |
| **Controller async**   | Mixed                | All async (repository interface is always async)                   |

---

## Architecture

```
                        CLIENT
              ┌──────────┴─────────┐
           GraphQL                REST
              │                    │
              ▼                    ▼
   ┌─────────────────┐   ┌─────────────────┐
   │  Apollo Router  │   │  Kong Gateway   │
   │  :4000 (GQL)    │   │  :8000 (REST)   │
   └────────┬────────┘   └────────┬────────┘
            │ Federation           │
    ┌───────┴───────┐     ┌───────┴───────┐
    ▼               ▼     ▼               ▼
┌──────────┐   ┌──────────┐ (same services)
│user-svc  │   │blog-svc  │
│:4001     │   │:4002     │
│          │   │          │
│ /graphql ├───┤ /graphql │ ← Apollo Router (HTTP + WS)
│ /users/* ├───┤ /blogs/* │ ← Kong (REST)
│ ws:/users├───┤ ws:/blogs│ ← Socket.IO (REST clients)
└────┬─────┘   └─────┬────┘
     │               │
     └───────┬───────┘
             ▼
    Apache Kafka :9092
    ┌─────────────────────────┐
    │ Topics                  │
    │  user.created           │
    │  user.updated           │
    │  user.deleted           │
    │  blog.created           │
    │  blog.updated           │
    │  blog.deleted           │
    │  user.events.dlq  (DLQ) │
    │  blog.events.dlq  (DLQ) │
    └─────────────────────────┘
```

### Pattern B data flow (per mutation)

```
1. Client sends mutation / REST request
2. Service validates via Repository.findByXxx()
3. Service writes to Repository (InMemory / future: Prisma / TypeORM)
4. Service publishes KafkaEvent<T> { correlationId, eventType, version, payload }
5. Service returns the result immediately (response is instant)

── Async (decoupled) ──────────────────────────────────────────────────────
6. KafkaController receives event on topic
7. Parses KafkaEvent<T> envelope — validates structure
8. Checks processedCorrelationIds set (idempotency guard)
9. GraphQL: pubSub.publish('userCreated', ...) → fires @Subscription
10. Socket.IO: gateway.emitUserCreated(event) → broadcasts to /users namespace
11. On error: forwards to user.events.dlq / blog.events.dlq
12. Marks correlationId as processed
```

---

## Folder structure

```
├── user-service/
│   ├── src/
│   │   ├── common/
│   │   │   ├── filters/        gql-validation.filter.ts
│   │   │   ├── graphql/        scalars.ts
│   │   │   ├── kafka/
│   │   │   │   └── kafka-event.interface.ts  ← NEW: typed envelope
│   │   │   ├── responses/      (unchanged)
│   │   │   └── validators/     (unchanged)
│   │   ├── realtime/
│   │   │   └── user-events.gateway.ts        ← NEW: Socket.IO /users
│   │   └── users/
│   │       ├── repositories/
│   │       │   ├── user.repository.interface.ts     ← NEW
│   │       │   └── in-memory-user.repository.ts     ← NEW
│   │       ├── dto/            (unchanged)
│   │       ├── entities/       (unchanged)
│   │       ├── users.service.ts        ← MODIFIED: uses UserRepository
│   │       ├── users.resolver.ts       ← MODIFIED: async + Subscriptions
│   │       ├── users.rest.controller.ts ← MODIFIED: all methods async
│   │       ├── users.kafka.controller.ts ← MODIFIED: idempotency+DLQ+realtime
│   │       └── users.module.ts          ← MODIFIED: DI tokens wired
│   ├── app.module.ts    ← MODIFIED: subscriptions: { 'graphql-ws': ... }
│   └── main.ts          ← MODIFIED: IoAdapter added
│
├── blog-service/
│   └── src/
│       ├── common/kafka/
│       │   └── kafka-event.interface.ts         ← NEW
│       ├── realtime/
│       │   └── blog-events.gateway.ts           ← NEW: Socket.IO /blogs
│       └── blogs/
│           ├── repositories/
│           │   ├── blog.repository.interface.ts ← NEW
│           │   └── in-memory-blog.repository.ts ← NEW
│           ├── blogs.service.ts          ← MODIFIED: uses BlogRepository
│           ├── blogs.resolver.ts         ← MODIFIED: async + Subscriptions
│           ├── blogs.rest.controller.ts  ← MODIFIED: async
│           ├── blogs.kafka.controller.ts ← MODIFIED: idempotency+DLQ+realtime
│           └── blogs.module.ts           ← MODIFIED: DI tokens wired
│
├── docker-compose.yml   ← MODIFIED: kafka-init creates DLQ topics
└── README.md
```

---

## Repository Pattern — how to swap backends

### Current (InMemory)

```typescript
// UsersModule providers:
{ provide: 'USER_REPOSITORY', useClass: InMemoryUserRepository }
```

### Future: Prisma

```typescript
// 1. Create PrismaUserRepository implementing UserRepository
// 2. Change ONE line in UsersModule:
{ provide: 'USER_REPOSITORY', useClass: PrismaUserRepository }

// UsersService, UsersResolver, UsersRestController: zero changes.
```

### Future: TypeORM

```typescript
{ provide: 'USER_REPOSITORY', useClass: TypeOrmUserRepository }
```

### Future: Mongoose

```typescript
{ provide: 'USER_REPOSITORY', useClass: MongooseUserRepository }
```

The `UserRepository` interface is the contract. All current code depends
on this interface via `@Inject('USER_REPOSITORY')` — never on the concrete class.

---

## Kafka Event Envelope

Every Kafka message is now a typed `KafkaEvent<T>`:

```typescript
interface KafkaEvent<T> {
  correlationId: string; // UUID v4 — for idempotency + realtime correlation
  eventType: string; // mirrors topic name: "user.created"
  version: number; // schema version — bump on breaking changes
  timestamp: string; // ISO 8601 — producer-side clock
  payload: T; // typed domain object
}
```

**Wire example** (`user.created`):

```json
{
  "correlationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "eventType": "user.created",
  "version": 1,
  "timestamp": "2025-04-17T10:30:00.000Z",
  "payload": {
    "id": "b9e8d1a2-...",
    "name": "Alice Johnson",
    "email": "alice@example.com"
  }
}
```

---

## Setup

### Prerequisites

```bash
node --version   # >= 20
docker --version
npm install -g @apollo/rover
# Apollo Router binary in apollo-router/ directory
```

### Step 1 — Infrastructure

```bash
docker compose up -d
# kafka-init creates DLQ topics then exits — check with:
docker compose logs kafka-init
```

### Step 2 — user-service

```bash
cd user-service
npm install
npm run start:dev
# http://localhost:4001/graphql
# ws://localhost:4001/graphql   (graphql-ws subscriptions)
# ws://localhost:4001/users     (Socket.IO namespace)
```

### Step 3 — blog-service

```bash
cd blog-service
npm install
npm run start:dev
# http://localhost:4002/graphql
# ws://localhost:4002/graphql   (graphql-ws subscriptions)
# ws://localhost:4002/blogs     (Socket.IO namespace)
```

### Step 4 — Apollo Router

```bash
cd apollo-router
rover supergraph compose --config supergraph.yaml > supergraph.graphql
./router --config router.yaml --supergraph supergraph.graphql
# http://localhost:4000
```

---

## GraphQL Subscriptions

Connect via `graphql-ws` protocol. Open Apollo Sandbox at `http://localhost:4001`
or `http://localhost:4002` and use the subscription panel:

### Subscribe to user events

```graphql
# Terminal 1 — subscribe before mutating
subscription {
  userCreated {
    id
    name
    email
  }
}

subscription {
  userUpdated {
    id
    name
    email
  }
}

subscription {
  userDeleted # returns the deleted user id as String
}
```

### Subscribe to blog events

```graphql
subscription {
  blogCreated {
    id
    title
    content
    authorId
  }
}

subscription {
  blogUpdated {
    id
    title
    content
  }
}

subscription {
  blogDeleted # returns the deleted blog id as String
}
```

### Full flow demo (two terminals)

**Terminal A — Subscribe:**

```graphql
subscription {
  userCreated {
    id
    name
    email
  }
}
```

**Terminal B — Mutate:**

```graphql
mutation {
  createUser(input: { name: "Alice", email: "alice@example.com" }) {
    __typename
    ... on UserSuccessResponse {
      statusCode
      message
      data {
        id
        name
        email
      }
    }
    ... on ErrorResponse {
      statusCode
      message
      errors {
        field
        message
      }
    }
  }
}
```

**What happens:**

1. Mutation returns immediately with the created user
2. `UsersService.publish()` emits `KafkaEvent<User>` to `user.created` topic
3. `UsersKafkaController.handleUserCreated()` consumes the event
4. `pubSub.publish('userCreated', ...)` fires the subscription
5. Terminal A receives `{ data: { userCreated: { id, name, email } } }`

---

## Socket.IO (REST clients)

```javascript
// user-service
const { io } = require("socket.io-client");
const socket = io("http://localhost:4001/users");

socket.on("connect", () => console.log("Connected to user-service"));
socket.on("user:created", (event) => console.log("New user:", event.payload));
socket.on("user:updated", (event) =>
  console.log("Updated user:", event.payload),
);
socket.on("user:deleted", (event) =>
  console.log("Deleted user id:", event.payload.id),
);
```

```javascript
// blog-service
const socket = io("http://localhost:4002/blogs");
socket.on("blog:created", (event) => console.log("New blog:", event.payload));
socket.on("blog:updated", (event) =>
  console.log("Updated blog:", event.payload),
);
socket.on("blog:deleted", (event) =>
  console.log("Deleted blog id:", event.payload.id),
);
```

The `event` object is the full `KafkaEvent<T>` envelope — clients get
`correlationId` so they can match the push back to the mutation that triggered it:

```javascript
// Client-side correlation
const pendingMutations = new Map();

// When you mutate, save a callback keyed by correlationId:
//   (correlationId is not exposed at GraphQL level in this demo,
//    but it IS in the Socket.IO event envelope)
socket.on("user:created", ({ correlationId, payload }) => {
  const callback = pendingMutations.get(correlationId);
  if (callback) callback(payload);
});
```

---

## Dead Letter Queue

Failed consumer messages go to:

- `user.events.dlq` — user-service consumer failures
- `blog.events.dlq` — blog-service consumer failures

Inspect via Kafka UI at `http://localhost:8080`.

DLQ message shape:

```json
{
  "originalTopic": "user.created",
  "originalPayload": { "...raw kafka message..." },
  "error": "Some error message",
  "partition": 0,
  "timestamp": "2025-04-17T10:30:00.000Z"
}
```

To replay: consume from the DLQ and re-publish to the original topic
after fixing the root cause.

---

## Multi-instance deployments

| Component         | Current                 | Production upgrade                               |
| ----------------- | ----------------------- | ------------------------------------------------ |
| PubSub            | In-process `PubSub`     | `RedisPubSub` from `graphql-redis-subscriptions` |
| Idempotency store | In-process `Set`        | Redis SET with TTL                               |
| Repository        | `InMemoryXxxRepository` | `PrismaXxxRepository` / `TypeOrmXxxRepository`   |

To upgrade PubSub to Redis — change ONE line in UsersModule/BlogsModule:

```typescript
{
  provide: 'GQL_PUB_SUB',
  useFactory: () => new RedisPubSub({
    publisher:  new Redis({ host: 'redis', port: 6379 }),
    subscriber: new Redis({ host: 'redis', port: 6379 }),
  }),
}
```

No other changes needed anywhere.
