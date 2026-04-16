# NestJS Microservices — Apollo Federation v2 + Kong + Unified Response System

> Two NestJS subgraphs (user-service, blog-service) with a unified ApiResponse
> union, Apollo Router for GraphQL, Kong for REST, and Kafka for async events.

---

## Architecture

```
                         CLIENT
               ┌──────────┴──────────┐
            GraphQL                REST
               │                    │
               ▼                    ▼
    ┌─────────────────┐   ┌─────────────────┐
    │  Apollo Router  │   │  Kong Gateway   │
    │  (Rust binary)  │   │  (Docker)       │
    │  :4000          │   │  :8000          │
    └────────┬────────┘   └────────┬────────┘
             │ Federation           │ HTTP proxy
     ┌───────┴───────┐     ┌───────┴───────┐
     ▼               ▼     ▼               ▼
┌──────────┐   ┌──────────┐ (same services)
│user-svc  │   │blog-svc  │
│:3001     │   │:3002     │
│/graphql  │   │/graphql  │ ← Apollo Router
│/users/*  │   │/blogs/*  │ ← Kong Gateway
└────┬─────┘   └────┬─────┘
     └──────┬────────┘
            ▼
    Apache Kafka :9092
```

---

## Folder Structure

```
microservices/
├── docker-compose.yml                    # Infra only: Kafka + Kong
│
├── user-service/                         # NestJS :3001
│   ├── schema.graphql                    # ← Authoritative SDL (Code Generator / CI)
│   └── src/
│       ├── main.ts                       # Hybrid bootstrap + GqlValidationFilter
│       ├── app.module.ts                 # GraphQL Federation + DateTime scalar
│       ├── common/
│       │   ├── graphql/
│       │   │   └── scalars.ts            # DateTime scalar re-export
│       │   ├── responses/
│       │   │   ├── field-error.type.ts   # FieldError { field message }
│       │   │   ├── error-response.type.ts# ErrorResponse (400|404|409|500)
│       │   │   ├── base-response.type.ts # BaseResponse (delete success)
│       │   │   ├── user-success-response.type.ts  # UserSuccessResponse | UsersSuccessResponse
│       │   │   ├── api-response.union.ts # union ApiResponse + resolveType
│       │   │   └── response.factory.ts   # ResponseFactory (centralised builder)
│       │   ├── validators/
│       │   │   └── validation.util.ts    # transformValidationErrors()
│       │   └── filters/
│       │       └── gql-validation.filter.ts  # BadRequestException → ErrorResponse
│       └── users/
│           ├── entities/user.entity.ts   # @ObjectType @key(fields:"id")
│           ├── dto/user.input.ts         # Create|Update|Delete InputTypes
│           ├── users.service.ts          # CRUD + Kafka producer (plain User)
│           ├── users.resolver.ts         # All ops return ApiResponse
│           ├── users.rest.controller.ts  # REST /users/* (Kong)
│           ├── users.kafka.controller.ts # Kafka @EventPattern consumers
│           └── users.module.ts
│
├── blog-service/                         # NestJS :3002
│   ├── schema.graphql                    # ← Authoritative SDL
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       ├── common/                       # Mirror of user-service common/
│       │   ├── graphql/scalars.ts
│       │   ├── responses/
│       │   │   ├── field-error.type.ts
│       │   │   ├── base-responses.type.ts        # ErrorResponse + BaseResponse
│       │   │   ├── blog-success-response.type.ts # BlogSuccessResponse | BlogsSuccessResponse
│       │   │   ├── api-response.union.ts
│       │   │   └── response.factory.ts
│       │   ├── validators/validation.util.ts
│       │   └── filters/gql-validation.filter.ts
│       └── blogs/
│           ├── entities/blog.entity.ts   # Blog @key + User @extends @external
│           ├── dto/blog.input.ts
│           ├── blogs.service.ts          # CRUD + Kafka + orphan cleanup
│           ├── blogs.resolver.ts         # All ops return ApiResponse + @ResolveField author
│           ├── blogs.rest.controller.ts
│           ├── blogs.kafka.controller.ts # Handles user.deleted → orphan cleanup
│           └── blogs.module.ts
│
├── apollo-router/
│   ├── supergraph.yaml                   # rover supergraph compose config
│   └── router.yaml                       # Router runtime config
│
└── kong-gateway/
    └── kong.yml                          # DB-less declarative route config
```

---

## Response System

### GraphQL Types Hierarchy

```
ApiResponse (union)
├── ErrorResponse          — any failure
│   ├── statusCode: Int!
│   ├── success: false
│   ├── message: String!
│   ├── errors: [FieldError!]   ← field-level validation failures (400 only)
│   └── timestamp: DateTime!
│
├── BaseResponse           — delete success (no data payload)
│   ├── statusCode: Int!
│   ├── success: true
│   ├── message: String!
│   └── timestamp: DateTime!
│
├── UserSuccessResponse    — single user success
│   ├── statusCode: Int!
│   ├── success: true
│   ├── message: String!
│   ├── data: User!
│   └── timestamp: DateTime!
│
├── UsersSuccessResponse   — user list success
│   ├── data: [User!]!
│   └── ... same base fields
│
├── BlogSuccessResponse    — single blog success
│   ├── data: Blog!        ← Blog.author resolved via Federation
│   └── ... same base fields
│
└── BlogsSuccessResponse   — blog list success
    ├── data: [Blog!]!     ← each Blog.author resolved via Federation batch
    └── ... same base fields
```

### ResponseFactory Usage (inside resolvers)

```typescript
// Single entity success
return ResponseFactory.user(
  user,
  "User created successfully",
  HttpStatus.CREATED,
);

// List success
return ResponseFactory.users(users, "Users retrieved successfully");

// Delete success
return ResponseFactory.deleted("User deleted successfully");

// From caught exception (maps status codes automatically)
return ResponseFactory.fromException(error);

// Manual errors
return ResponseFactory.notFound('User "abc" not found');
return ResponseFactory.conflict("Email already registered");
return ResponseFactory.validationError(fieldErrors);
```

### Validation Flow

```
Client sends mutation with invalid input
        │
        ▼
NestJS ValidationPipe runs class-validator
        │  fails
        ▼
BadRequestException({ message: ValidationError[] })
        │
        ▼
GqlValidationFilter.catch()
        │
        ▼
transformValidationErrors()  →  FieldError[]
        │
        ▼
ResponseFactory.validationError(fieldErrors)
        │
        ▼
ErrorResponse { statusCode:400, errors:[{field,message}], timestamp }
        │
        ▼
Apollo returns as resolver result (NOT a raw GraphQL error)
```

---

## Setup (No Docker for NestJS)

### Prerequisites

```bash
node --version   # >= 20
docker --version

# Rover CLI (Apollo schema tool)
npm install -g @apollo/rover

# Apollo Router binary (run from apollo-router/ dir)
cd apollo-router
curl -sSL https://router.apollo.dev/download/nix/latest | sh
```

### Step 1 — Start Infrastructure

```bash
docker compose up -d
# Wait 20–30s for Kafka to initialise
docker compose logs kafka | grep "started (kafka.server.KafkaServer)"
```

### Step 2 — Start user-service (Terminal 1)

```bash
cd user-service && npm install && npm run start:dev
# → http://localhost:4001/graphql  (subgraph)
# → http://localhost:4001/users/*  (REST)
```

### Step 3 — Start blog-service (Terminal 2)

```bash
cd blog-service && npm install && npm run start:dev
# → http://localhost:4002/graphql  (subgraph)
# → http://localhost:4002/blogs/*  (REST)
```

### Step 4 — Compose supergraph & start Apollo Router (Terminal 3)

```bash
cd apollo-router
curl -sSL https://rover.apollo.dev/nix/latest | sh # for the first-time
rover supergraph compose --config supergraph.yaml > supergraph.graphql
./router --config router.yaml --supergraph supergraph.graphql
# → http://localhost:4000  (GraphQL unified entry point)
```

### Step 5 — Verify Kong

```bash
curl http://localhost:8001/services | jq .   # lists user-service, blog-service
curl http://localhost:8001/routes   | jq .   # lists all 4 routes
```

---

## Testing — GraphQL via Apollo Router (:4000)

### createUser — success response

```graphql
mutation {
  createUser(input: { name: "Alice Johnson", email: "alice@example.com" }) {
    __typename
    ... on UserSuccessResponse {
      statusCode
      success
      message
      timestamp
      data {
        id
        name
        email
      }
    }
    ... on ErrorResponse {
      statusCode
      success
      message
      timestamp
      errors {
        field
        message
      }
    }
  }
}
```

**Response (201 success):**

```json
{
  "data": {
    "createUser": {
      "__typename": "UserSuccessResponse",
      "statusCode": 201,
      "success": true,
      "message": "User created successfully",
      "timestamp": "2025-04-16T10:30:00.000Z",
      "data": {
        "id": "uuid-here",
        "name": "Alice Johnson",
        "email": "alice@example.com"
      }
    }
  }
}
```

### createUser — validation error (empty name)

```graphql
mutation {
  createUser(input: { name: "", email: "not-an-email" }) {
    __typename
    ... on ErrorResponse {
      statusCode
      success
      message
      timestamp
      errors {
        field
        message
      }
    }
  }
}
```

**Response (400 validation):**

```json
{
  "data": {
    "createUser": {
      "__typename": "ErrorResponse",
      "statusCode": 400,
      "success": false,
      "message": "Validation failed",
      "timestamp": "2025-04-16T10:30:00.000Z",
      "errors": [
        { "field": "name", "message": "name must not be empty" },
        { "field": "name", "message": "name must be at least 2 characters" },
        { "field": "email", "message": "email must be a valid email address" }
      ]
    }
  }
}
```

### createUser — conflict error (duplicate email)

**Response (409 conflict):**

```json
{
  "data": {
    "createUser": {
      "__typename": "ErrorResponse",
      "statusCode": 409,
      "success": false,
      "message": "Email \"alice@example.com\" is already registered",
      "timestamp": "2025-04-16T10:30:00.000Z",
      "errors": null
    }
  }
}
```

### createBlog with cross-service author resolution

```graphql
mutation {
  createBlog(
    input: {
      title: "My First Post"
      content: "Hello from blog-service via Apollo Federation!"
      authorId: "PASTE-USER-UUID"
    }
  ) {
    __typename
    ... on BlogSuccessResponse {
      statusCode
      success
      message
      timestamp
      data {
        id
        title
        content
        authorId
        author {
          id
          name
          email
        }
      }
    }
    ... on ErrorResponse {
      statusCode
      message
      errors {
        field
        message
      }
      timestamp
    }
  }
}
```

### getBlogs — list with per-blog author resolution

```graphql
query {
  getBlogs {
    __typename
    ... on BlogsSuccessResponse {
      statusCode
      success
      message
      timestamp
      data {
        id
        title
        content
        authorId
        author {
          id
          name
          email
        }
      }
    }
    ... on ErrorResponse {
      statusCode
      message
      timestamp
    }
  }
}
```

> Apollo Router batches ALL author lookups across the entire list into a single
> `_entities` request to user-service — one round-trip for 1000 blogs.

### deleteUser — triggers Kafka orphan cleanup

```graphql
mutation {
  deleteUser(input: { id: "PASTE-UUID" }) {
    __typename
    ... on BaseResponse {
      statusCode
      success
      message
      timestamp
    }
    ... on ErrorResponse {
      statusCode
      message
      timestamp
    }
  }
}
```

---

## Testing — REST via Kong (:8000)

```bash
# Create user
curl -s -X POST http://localhost:8000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}' | jq .

# Get all users
curl -s http://localhost:8000/users | jq .

# Get one user
curl -s http://localhost:8000/users/PASTE-UUID | jq .

# Update user
curl -s -X PUT http://localhost:8000/users/PASTE-UUID \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice Updated"}' | jq .

# Create blog
curl -s -X POST http://localhost:8000/blogs \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello World","content":"My first REST blog post.","authorId":"PASTE-UUID"}' | jq .

# Get all blogs
curl -s http://localhost:8000/blogs | jq .

# Delete user (triggers user.deleted Kafka → blog-service removes orphaned posts)
curl -s -X DELETE http://localhost:8000/users/PASTE-UUID | jq .

# Verify blogs cleaned up
curl -s http://localhost:8000/blogs | jq .
```

---

## GraphQL Code Generator Setup

```bash
npm install -D @graphql-codegen/cli \
  @graphql-codegen/typescript \
  @graphql-codegen/typescript-operations

# codegen.yml (place in project root):
overwrite: true
schema:
  - user-service/schema.graphql
  - blog-service/schema.graphql
generates:
  ./generated/types.ts:
    plugins:
      - typescript
      - typescript-operations

# Run:
npx graphql-codegen
```

---

## Kafka Topics

| Topic          | Emitted by   | Consumed by                   | Effect                              |
| -------------- | ------------ | ----------------------------- | ----------------------------------- |
| `user.created` | user-service | user-service, blog-service    | Observability hooks                 |
| `user.updated` | user-service | user-service, blog-service    | Cache invalidation hooks            |
| `user.deleted` | user-service | user-service, blog-service ⚡ | blog-service removes orphaned posts |
| `blog.created` | blog-service | blog-service                  | Search index / analytics hooks      |
| `blog.updated` | blog-service | blog-service                  | CDN purge hooks                     |
| `blog.deleted` | blog-service | blog-service                  | Search removal / cleanup hooks      |

---

## Troubleshooting

**`rover supergraph compose` fails**
→ All services must be running before composing.

**Apollo Router can't reach subgraphs**
→ Verify services are still running on http://localhost:4001 and http://localhost:\*.

**Kong returns 404**

```bash
curl http://localhost:8001/routes | jq .   # verify routes loaded
docker compose restart kong
```

**`host.docker.internal` not resolving (Linux)**
→ Add `--add-host=host.docker.internal:host-gateway` to the Kong container,
or use the `extra_hosts` key (already set in docker-compose.yml).

**Validation errors NOT appearing as ErrorResponse**
→ Ensure `GqlValidationFilter` is registered in `main.ts` via `app.useGlobalFilters()`.
→ Ensure `ValidationPipe.exceptionFactory` returns `new BadRequestException(errors)`
(passing the raw ValidationError[], not a string).
