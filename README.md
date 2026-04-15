# NestJS Microservices — Apollo Router + Kong Gateway

> Production-style demo: two NestJS microservices exposed through both an
> Apollo Federation supergraph (via Apollo Router) and a REST API (via Kong),
> connected by Apache Kafka for async event streaming.

---

## Architecture

```
                         ┌──────────────────────────────┐
                         │           CLIENT             │
                         │  (Browser / Postman / curl)  │
                         └──────────────┬───────────────┘
                                        │
                      ┌─────────────────┴───────────────┐
                      │ GraphQL                         │ REST
                      ▼                                 ▼
            ┌──────────────────┐             ┌──────────────────┐
            │  Apollo Router   │             │   Kong Gateway   │
            │  (Rust binary)   │             │   (Docker)       │
            │  localhost:4000  │             │  localhost:8000  │
            └────────┬─────────┘             └─────────┬────────┘
                     │ Federation subgraph             │ HTTP proxy
                     │ introspection + routing         │ (no GraphQL)
            ┌────────┴─────────┐             ┌─────────┴────────┐
            ▼                  ▼             ▼                  ▼
    ┌──────────────┐  ┌──────────────┐  (same services — both entry points share them)
    │ user-service │  │ blog-service │
    │ :3001        │  │ :3002        │
    │              │  │              │
    │ /graphql ────┼──┼──────────────┼──► Apollo Router (subgraph)
    │ /users/* ────┼──┼──────────────┼──► Kong          (REST)
    │              │  │              │
    │ /graphql ────┼──┼──────────────┼──► Apollo Router (subgraph)
    │              │  │ /blogs/* ────┼──► Kong          (REST)
    └──────┬───────┘  └───────┬──────┘
           │                  │
           └────────┬─────────┘
                    ▼
          ┌─────────────────┐
          │  Apache Kafka   │
          │  localhost:9092 │
          └─────────────────┘
```

### Key Design Principle

**Apollo Router and Kong are completely independent.** Neither knows about the
other. Either can be removed without affecting the microservices or the other
gateway. The services simply expose BOTH `/graphql` (for the Router) and
`/users` or `/blogs` REST routes (for Kong) on the same HTTP port.

---

## Services at a Glance

| Service       | Port | Transport      | Description                                  |
| ------------- | ---- | -------------- | -------------------------------------------- |
| user-service  | 3001 | HTTP + Kafka   | GraphQL subgraph + REST /users endpoints     |
| blog-service  | 3002 | HTTP + Kafka   | GraphQL subgraph + REST /blogs endpoints     |
| Apollo Router | 4000 | HTTP (GraphQL) | Rust binary — composes Federation supergraph |
| Kong Gateway  | 8000 | HTTP (REST)    | Docker — pure HTTP proxy to microservices    |
| Kafka         | 9092 | TCP            | Message broker for domain events             |
| Kafka UI      | 8080 | HTTP           | Web dashboard to inspect topics              |
| Kong Admin    | 8001 | HTTP           | Kong Admin API (DB-less, read-heavy)         |

---

## Kafka Topics

| Topic          | Emitted by   | Consumed by                   | Purpose                      |
| -------------- | ------------ | ----------------------------- | ---------------------------- |
| `user.created` | user-service | user-service, blog-service    | Observability / side-effects |
| `user.updated` | user-service | user-service, blog-service    | Cache invalidation           |
| `user.deleted` | user-service | user-service, blog-service ⚡ | Orphan blog cleanup          |
| `blog.created` | blog-service | blog-service                  | Search index / analytics     |
| `blog.updated` | blog-service | blog-service                  | Search index update          |
| `blog.deleted` | blog-service | blog-service                  | CDN purge / search removal   |

⚡ `user.deleted` → blog-service removes all posts where `authorId` matches.
This is microservice-native referential integrity via event streaming.

---

## Folder Structure

```
microservices/
│
├── docker-compose.yml          # Infrastructure only: Kafka + Kong
│
├── user-service/               # NestJS — port 3001
│   ├── src/
│   │   ├── main.ts             # Hybrid bootstrap: HTTP + Kafka consumer
│   │   ├── app.module.ts       # GraphQL Federation config
│   │   └── users/
│   │       ├── entities/
│   │       │   └── user.entity.ts          # @ObjectType @key(fields:"id")
│   │       ├── dto/
│   │       │   └── user.input.ts           # Create / Update / Delete DTOs
│   │       ├── users.service.ts            # CRUD + Kafka producer
│   │       ├── users.resolver.ts           # GraphQL queries/mutations + @ResolveReference
│   │       ├── users.rest.controller.ts    # REST endpoints /users/* (for Kong)
│   │       ├── users.kafka.controller.ts   # Kafka @EventPattern consumers
│   │       └── users.module.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── nest-cli.json
│
├── blog-service/               # NestJS — port 3002
│   ├── src/
│   │   ├── main.ts             # Hybrid bootstrap: HTTP + Kafka consumer
│   │   ├── app.module.ts       # GraphQL Federation config
│   │   └── blogs/
│   │       ├── entities/
│   │       │   └── blog.entity.ts          # Blog @key + User @extends @external stub
│   │       ├── dto/
│   │       │   └── blog.input.ts           # Create / Update / Delete DTOs
│   │       ├── blogs.service.ts            # CRUD + Kafka + orphan cleanup
│   │       ├── blogs.resolver.ts           # GraphQL + @ResolveField author
│   │       ├── blogs.rest.controller.ts    # REST endpoints /blogs/* (for Kong)
│   │       ├── blogs.kafka.controller.ts   # Kafka consumers (incl. user.deleted)
│   │       └── blogs.module.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── nest-cli.json
│
├── apollo-router/              # Apollo Router (Rust binary) — port 4000
│   ├── supergraph.yaml         # Rover CLI composition config
│   ├── router.yaml             # Router runtime config (CORS, health, sandbox)
│   └── supergraph.graphql      # Generated by rover (DO NOT hand-edit)
│
└── kong-gateway/               # Kong API Gateway (Docker) — port 8000
    └── kong.yml                # Declarative DB-less config (routes → services)
```

---

## Local Setup (No Docker for NestJS — Everything Runs Natively)

### Prerequisites

```bash
# Node.js 20 or higher
node --version   # must be >= 20

# Docker Desktop (Mac/Windows) or Docker Engine + Docker Compose (Linux)
docker --version

# Rover CLI — Apollo's schema composition tool
npm install -g @apollo/rover
rover --version  # should print version

# Apollo Router binary — standalone Rust binary, ~50 MB download
# Run from the apollo-router/ directory:
cd apollo-router
curl -sSL https://router.apollo.dev/download/nix/latest | sh
# This places ./router (or router.exe on Windows) in the current directory
./router --version
```

---

### Step 1 — Start Infrastructure (Kafka + Kong)

```bash
# From the microservices/ root directory
docker compose up -d

# Verify all containers are healthy
docker compose ps

# Expected:
#   zookeeper   running
#   kafka       running
#   kafka-ui    running
#   kong        running (healthy)
```

> ⏳ Wait **20–30 seconds** after Kafka starts before proceeding.
> Kafka needs time to elect a controller and create the `__consumer_offsets` topic.

```bash
# Confirm Kafka is ready:
docker compose logs kafka | grep "started (kafka.server.KafkaServer)"
```

---

### Step 2 — Install & Start user-service

Open **Terminal 1**:

```bash
cd microservices/user-service
npm install
npm run start:dev
```

Expected output:

```
🚀 user-service HTTP running on  http://localhost:3001
   ├─ GraphQL subgraph: http://localhost:3001/graphql
   └─ REST endpoints:   http://localhost:3001/users/*
📨 Kafka consumer on localhost:9092 [user-service-group]
```

Verify:

```bash
curl http://localhost:3001/users          # REST: []
curl -X POST http://localhost:3001/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ getUsers { id name email } }"}'
```

---

### Step 3 — Install & Start blog-service

Open **Terminal 2**:

```bash
cd microservices/blog-service
npm install
npm run start:dev
```

Expected output:

```
🚀 blog-service HTTP running on  http://localhost:3002
   ├─ GraphQL subgraph: http://localhost:3002/graphql
   └─ REST endpoints:   http://localhost:3002/blogs/*
📨 Kafka consumer on localhost:9092 [blog-service-group]
```

---

### Step 4 — Compose Supergraph & Start Apollo Router

Open **Terminal 3**:

```bash
cd microservices/apollo-router

# Compose the supergraph SDL from both running subgraphs.
# This fetches SDL from :3001 and :3002 and merges them.
rover supergraph compose --config supergraph.yaml > supergraph.graphql

# Verify the output file was created
cat supergraph.graphql | head -20

# Start Apollo Router
./router --config router.yaml --supergraph supergraph.graphql
```

Expected output:

```
Apollo Router v1.x.x // (c) Apollo Graph, Inc.
GraphQL endpoint exposed at http://127.0.0.1:4000/ 🚀
```

> **Every time you change a subgraph schema**, re-run `rover supergraph compose`
> and restart the Router. In production, use Managed Federation (Apollo GraphOS)
> to automate this.

---

### Step 5 — Verify Kong

```bash
# Check Kong is running and loaded the config
curl http://localhost:8001/status           # Kong Admin health
curl http://localhost:8001/services         # Should list user-service and blog-service
curl http://localhost:8001/routes           # Should list all 10 routes
```

---

## Testing — GraphQL via Apollo Router

All examples target **http://localhost:4000** (Apollo Router — single GraphQL entry point).

Open the Sandbox at **http://localhost:4000** for an interactive playground.

### Users

#### Create a user

```graphql
mutation CreateUser {
  createUser(input: { name: "Alice Johnson", email: "alice@example.com" }) {
    id
    name
    email
  }
}
```

#### Get all users

```graphql
query GetUsers {
  getUsers {
    id
    name
    email
  }
}
```

#### Get one user

```graphql
query GetUser {
  getUser(id: "PASTE-UUID-HERE") {
    id
    name
    email
  }
}
```

#### Update a user

```graphql
mutation UpdateUser {
  updateUser(
    input: {
      id: "PASTE-UUID-HERE"
      name: "Alice Updated"
      email: "alice.updated@example.com"
    }
  ) {
    id
    name
    email
  }
}
```

#### Delete a user

```graphql
mutation DeleteUser {
  deleteUser(input: { id: "PASTE-UUID-HERE" })
}
```

---

### Blogs

#### Create a blog post

```graphql
mutation CreateBlog {
  createBlog(
    input: {
      title: "My First Post"
      content: "Hello from blog-service via Apollo Federation!"
      authorId: "PASTE-USER-UUID-HERE"
    }
  ) {
    id
    title
    content
    authorId
  }
}
```

#### Get all blogs

```graphql
query GetBlogs {
  getBlogs {
    id
    title
    content
    authorId
  }
}
```

#### Get blog WITH cross-service author (Federation in action)

```graphql
query GetBlogWithAuthor {
  getBlogWithAuthor(id: "PASTE-BLOG-UUID-HERE") {
    id
    title
    content
    author {
      id
      name
      email
    }
  }
}
```

> **What happens under the hood:**
>
> 1. Apollo Router receives the query.
> 2. It routes `id title content` to blog-service.
> 3. blog-service returns `{ id, title, content, author: { id: authorId } }`.
> 4. Router sees `author` is a `User` with `@key(fields: "id")`.
> 5. Router sends `_entities` batch query to user-service: `{ __typename: "User", id }`.
> 6. user-service returns the full `User` record.
> 7. Router stitches both results together and returns to the client.

#### Update a blog

```graphql
mutation UpdateBlog {
  updateBlog(
    input: {
      id: "PASTE-BLOG-UUID-HERE"
      title: "Updated Title"
      content: "Updated body content."
    }
  ) {
    id
    title
    content
  }
}
```

#### Delete a blog

```graphql
mutation DeleteBlog {
  deleteBlog(input: { id: "PASTE-BLOG-UUID-HERE" })
}
```

---

## Testing — REST via Kong

All examples target **http://localhost:8000** (Kong Gateway — pure REST).
Kong proxies directly to the REST controllers on the microservices.

### Users via REST

```bash
# GET all users
curl http://localhost:8000/users

# GET one user
curl http://localhost:8000/users/PASTE-UUID-HERE

# POST — create a user
curl -X POST http://localhost:8000/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Bob Smith", "email": "bob@example.com"}'

# PUT — update a user (partial — all fields optional)
curl -X PUT http://localhost:8000/users/PASTE-UUID-HERE \
  -H "Content-Type: application/json" \
  -d '{"name": "Bob Updated"}'

# DELETE — delete a user
# ⚡ This triggers user.deleted Kafka event → blog-service removes orphaned posts
curl -X DELETE http://localhost:8000/users/PASTE-UUID-HERE
```

### Blogs via REST

```bash
# GET all blogs
curl http://localhost:8000/blogs

# GET one blog
curl http://localhost:8000/blogs/PASTE-BLOG-UUID-HERE

# POST — create a blog post
curl -X POST http://localhost:8000/blogs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "REST-created Post",
    "content": "Created via Kong REST gateway.",
    "authorId": "PASTE-USER-UUID-HERE"
  }'

# PUT — update a blog
curl -X PUT http://localhost:8000/blogs/PASTE-BLOG-UUID-HERE \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated via Kong", "content": "New body text."}'

# DELETE — delete a blog
curl -X DELETE http://localhost:8000/blogs/PASTE-BLOG-UUID-HERE
```

---

## End-to-End Test Script

Run this sequence to verify the full system (requires `jq`):

```bash
ROUTER="http://localhost:4000"
KONG="http://localhost:8000"

echo "=== 1. Create user via Apollo Router ==="
USER=$(curl -s -X POST $ROUTER \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { createUser(input: { name: \"Alice\", email: \"alice@e2e.com\" }) { id name email } }"}')
echo $USER | jq .
USER_ID=$(echo $USER | jq -r '.data.createUser.id')
echo "User id: $USER_ID"

echo ""
echo "=== 2. Create blog via Kong REST ==="
BLOG=$(curl -s -X POST $KONG/blogs \
  -H "Content-Type: application/json" \
  -d "{\"title\": \"E2E Test Post\", \"content\": \"Created via Kong.\", \"authorId\": \"$USER_ID\"}")
echo $BLOG | jq .
BLOG_ID=$(echo $BLOG | jq -r '.id')
echo "Blog id: $BLOG_ID"

echo ""
echo "=== 3. Fetch blog WITH author via Apollo Router (federation join) ==="
curl -s -X POST $ROUTER \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"query { getBlogWithAuthor(id: \\\"$BLOG_ID\\\") { id title content author { id name email } } }\"}" | jq .

echo ""
echo "=== 4. Verify REST GET /users and GET /blogs via Kong ==="
curl -s $KONG/users | jq .
curl -s $KONG/blogs | jq .

echo ""
echo "=== 5. Delete user via Kong (triggers Kafka → orphan blog cleanup) ==="
curl -s -X DELETE $KONG/users/$USER_ID | jq .

echo ""
echo "=== 6. Verify blogs are cleaned up (should be empty) ==="
sleep 1  # allow Kafka event to propagate
curl -s $KONG/blogs | jq .

echo ""
echo "✅ End-to-end test complete."
```

---

## How Each Component Works

### Apollo Router — GraphQL entry point

1. **Startup**: `rover supergraph compose` fetches SDL from both subgraphs and
   composes a unified supergraph schema, writing it to `supergraph.graphql`.

2. **Runtime**: The Router reads `supergraph.graphql` and uses it to build a
   query plan for every incoming request. It knows which fields belong to which
   subgraph based on the `@key` and `@external` Federation directives.

3. **Entity resolution**: When blog-service returns `author { id }`, the Router
   recognises this as a `User` entity reference (via `@key(fields: "id")`),
   sends a `_entities` batch query to user-service, and merges the response.

4. **Independence**: The Router has no knowledge of REST, Kafka, or Kong.

### Kong Gateway — REST entry point

1. **Startup**: Reads `kong-gateway/kong.yml` (declarative, DB-less mode).
   No Admin API calls needed — all routes are defined in the YAML file.

2. **Routing**: Matches incoming HTTP method + path against the route list.
   Proxies matched requests to the upstream service URL via plain HTTP.

3. **Independence**: Kong has no knowledge of GraphQL, Apollo, or Federation.
   It just does HTTP proxying to REST endpoints.

### Kafka — event streaming

1. **Producers**: Each service uses `@Client()` + `ClientKafka.emit()` to
   publish domain events **fire-and-forget** after every mutation.

2. **Consumers**: `@EventPattern()` decorated methods in the Kafka controllers
   react to events. Each service runs in its own consumer group so both
   user-service and blog-service independently receive every user.\* event.

3. **Orphan cleanup**: `user.deleted` → blog-service's `handleUserDeleted()`
   removes all blog posts where `authorId` matches — microservice-native
   referential integrity without shared databases or synchronous RPC.

---

## Troubleshooting

### `rover supergraph compose` fails

```
Error: Could not fetch SDL from http://localhost:3001/graphql
```

→ Make sure **user-service AND blog-service are both running** before composing.

---

### Apollo Router can't reach subgraphs at runtime

```
WARN fetch error: connection refused
```

→ Verify the services are still running (they must stay up while Router runs).
→ Check that ports 3001 and 3002 are not blocked by a firewall.

---

### Kong returns 404

```bash
curl http://localhost:8000/users   # → {"message":"no Route matched"}
```

→ Verify Kong loaded the config: `curl http://localhost:8001/routes | jq .`
→ Restart Kong: `docker compose restart kong`
→ Check logs: `docker compose logs kong`

---

### Kafka consumer not receiving events

→ Check `docker compose ps` — Kafka must be `running`.
→ Open Kafka UI at http://localhost:8080 — confirm topics exist and have messages.
→ Ensure services started **after** Kafka was ready (wait 20s after `docker compose up`).

---

### `host.docker.internal` not resolving (Linux)

→ Add `--add-host=host.docker.internal:host-gateway` to the Kong container, or
edit `docker-compose.yml` to set the IP explicitly:

```yaml
extra_hosts:
  - "host.docker.internal:172.17.0.1" # use your Docker bridge IP
```

---

## Environment Variables

| Variable       | Default        | Service             | Description          |
| -------------- | -------------- | ------------------- | -------------------- |
| `PORT`         | 3001           | user-service        | HTTP listen port     |
| `PORT`         | 3002           | blog-service        | HTTP listen port     |
| `KAFKA_BROKER` | localhost:9092 | user + blog service | Kafka broker address |

Create a `.env` file in any service directory to override defaults:

```env
PORT=3001
KAFKA_BROKER=localhost:9092
```
