# 🔐 Locker Network Backend

> Secure smart locker management system with JWT authentication, role-based access control, audit logging, and AWS Lambda integration.

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Tech Stack](#-tech-stack)
- [Installation](#-installation)
- [Environment Setup](#-environment-setup)
- [Running Locally](#-running-locally)
- [Docker Deployment](#-docker-deployment)
- [Database Migrations](#-database-migrations)
- [Testing](#-testing)
- [API Documentation](#-api-documentation)
- [Authentication Flow](#-authentication-flow)
- [Security](#-security)
- [Rate Limiting](#-rate-limiting)
- [Audit Logging](#-audit-logging)
- [Health Check](#-health-check)
- [Project Structure](#-project-structure)

---

## ⚡ Quick Start

### Full Docker Quick Start

Run these commands in order for a clean, full local Docker setup:

```bash
cd locker-network-repository/lambda
npm install
npm run build

cd ../backend
cp .env.localstack.example .env
# optional for Google Sign-In:
# export GOOGLE_CLIENT_ID=your-google-oauth-client-id
docker compose down -v
docker compose up --build -d
docker compose ps
docker exec locker-backend wget -qO- http://localhost:3555/health
```

This sequence does all required steps:

- builds the TypeScript Lambda artifacts used by LocalStack
- starts PostgreSQL, Redis, LocalStack, and backend
- recreates Docker volumes for a clean bootstrap
- keeps Docker in LocalStack mode without inheriting remote AWS health settings from `.env`
- verifies backend health from inside the container

Notes:

- `cp .env.localstack.example .env` creates the local Docker env file used by Docker Compose variable substitution.
- Google login in Docker reads `GOOGLE_CLIENT_ID` from the host shell or `.env`, but the container still keeps localstack-safe defaults such as `USE_LAMBDA_HEALTH=false`.

If you only changed backend code:

```bash
cd locker-network-repository/backend
docker compose up --build -d
```

```bash
# Clone repository
git clone https://github.com/locker-network-java-30-final-project/locker-network-repository
cd locker-network-repository/backend

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env — replace JWT secrets and AWS resource values as needed

# Configure AWS credentials for DynamoDB/SQS access
# Option A:
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_REGION=eu-west-1

# Option B:
export AWS_PROFILE=your-profile-name

# Generate Prisma client
npx prisma generate  

# Run migrations
npx prisma migrate dev

# Start development server
npm run dev
```

Server: `http://localhost:3555`
Swagger docs: `http://localhost:3555/docs` when `NODE_ENV != production`

---

## 🛠 Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Runtime** | Node.js | 22+     |
| **Language** | TypeScript | 5.9+    |
| **Framework** | Express.js | 5.2+    |
| **ORM** | Prisma | 5.22+   |
| **Database** | PostgreSQL | 12+     |
| **Auth** | JWT (access + refresh token rotation) | HS256   |
| **Password Hash** | Argon2 | 0.44+   |
| **Logging** | Winston | 3.19+   |
| **Rate Limiting** | express-rate-limit | 8.3+    |
| **Validation** | Zod | 4.3+    |
| **Security** | Helmet, HPP, CORS | latest  |
| **API Docs** | Swagger UI (OpenAPI 3.0) | latest  |

---

## 📦 Installation

### Prerequisites

- Node.js 22+ ([download](https://nodejs.org))
- npm
- PostgreSQL 12+ or Docker

### Install

```bash
npm install
```

### Verify

```bash
node --version  # 22+
npm --version   # 8+
```

---

## 🔐 Environment Setup

```bash
cp .env.example .env
```

Use [`.env.example`](./.env.example) as the canonical template for local configuration. It reflects the current local CORS, Google login, Redis station cache read settings, DynamoDB locker cache read settings, and SQS queue settings used by the backend.

Refresh-session policy:

- each new login revokes all previously active refresh sessions for the same user
- the same policy applies to Google login because it uses the same auth flow

### Full `.env` reference

```env
# Server
NODE_ENV=development                    # development | production | test
PORT=3555
SERVER_URL=http://localhost:3555
CLOUDFRONT_URL=https://your-cloudfront-domain
LOG_LEVEL=info                          # debug | info | warn | error

# Database
# Note: 5433 = host port mapped to Docker container's 5432
DATABASE_URL="postgresql://root:root@localhost:5433/locker"
POSTGRES_USER=root
POSTGRES_PASSWORD=root
POSTGRES_HOST=localhost
POSTGRES_PORT=5433

# JWT — generate secrets with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_ACCESS_SECRET=<min-32-chars>        # HS256, access token signing
JWT_REFRESH_SECRET=<min-32-chars>       # HS256, refresh token signing
JWT_ACCESS_EXPIRES_IN=15m               # Access token TTL
JWT_ACCESS_TOKEN_TTL=15                 # Access token TTL in minutes
JWT_REFRESH_EXPIRES_IN=7d               # Refresh token TTL
JWT_REFRESH_TOKEN_TTL=7                 # Refresh token TTL in days

# Frontend CORS origin
FRONTEND_URL=http://localhost:5173
FRONTEND_LOCAL_URL=http://localhost:5173

# Lambda health check
USE_LAMBDA_HEALTH=false                 # true = call AWS Lambda first, fallback to DB check on error
LAMBDA_HEALTH_URL=                      # Required when USE_LAMBDA_HEALTH=true

# RDS booking expiration reconciliation
BOOKING_EXPIRATION_DISABLED=false       # true disables backend expiration job
BOOKING_EXPIRATION_INTERVAL_MS=60000    # how often backend scans expired ACTIVE bookings
BOOKING_EXPIRATION_BATCH_SIZE=100       # max bookings processed per scan

# AWS / async operations
AWS_REGION=eu-west-1
AWS_PROFILE=                            # Optional: local AWS profile name
DYNAMODB_ENDPOINT_URL=                  # Optional: override only for LocalStack/custom endpoint
SQS_ENDPOINT_URL=                       # Optional: override only for LocalStack/custom endpoint
AWS_ENDPOINT_URL=                       # Optional: shared endpoint override
REDIS_URL=redis://localhost:6379
REDIS_STATION_CACHE_PREFIX=station-cache:
REDIS_STATION_CACHE_TTL_SECONDS=300
DYNAMO_ROLE_ARN=                        # Optional: assume-role ARN for DynamoDB/SQS access
DYNAMO_ROLE_SESSION_NAME=locker-backend-dynamo
DYNAMO_TABLE_NAME=locker-dev-operations-dynamodb
DYNAMO_BOOKINGS_TABLE_NAME=locker-dev-bookings-dynamodb
DYNAMO_LOCKER_CACHE_TABLE_NAME=locker-dev-locker-cache
OPERATIONS_QUEUE_URL=https://sqs.eu-west-1.amazonaws.com/131904957044/locker-dev-operations-queue
CACHE_PROJECTION_QUEUE_URL=https://sqs.eu-west-1.amazonaws.com/131904957044/locker-dev-cache-projection
SQS_URL=https://sqs.eu-west-1.amazonaws.com/131904957044/locker-dev-operations-queue
```

### AWS credentials are required

The backend validates AWS credentials during startup because async operation endpoints use DynamoDB and SQS.
Locker cache projection publishing also requires SQS access to `CACHE_PROJECTION_QUEUE_URL`.

Supported local setup options:

```bash
# Option A: static credentials
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_REGION=eu-west-1

# Option B: named profile
export AWS_PROFILE=your-profile-name
export AWS_REGION=eu-west-1
```

If your project uses role assumption, also configure `DYNAMO_ROLE_ARN` and, optionally, `DYNAMO_ROLE_SESSION_NAME`.

### ⚠️ Security requirements

```bash
# Generate strong secrets (required, min 32 chars):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Never commit `.env` to git.** Use `.env.example` for templates only.

---

## 🚀 Running Locally

### Development

```bash
npm run dev
```

- Hot reload via `ts-node-dev`
- Winston logging to console
- Swagger UI available at `/docs`
- Startup requires a reachable PostgreSQL instance and valid AWS credentials
- Background booking expiration reconciliation starts automatically unless `BOOKING_EXPIRATION_DISABLED=true`

Expected output:
```
[INFO] Starting server initialization...
[INFO] PostgreSQL connected successfully
[INFO] AWS credentials resolved successfully
[INFO] App running at http://localhost:3555
[INFO] Booking expiration job started
```

### Production

```bash
npm run build
npm start
```

---

## 🐳 Docker Deployment

```bash
# Start PostgreSQL + Redis + LocalStack + Backend
docker compose up --build -d

# Logs
docker compose logs -f backend

# Stop
docker compose down

# Reset volumes
docker compose down -v
```

### Local Docker stack

For local verification of the current cache setup, [docker-compose.yml](/Users/dmitrii/Desktop/BackEnd/locker-network-repository/locker-network-repository/backend/docker-compose.yml:1) starts:

- PostgreSQL with PostGIS
- Redis as station cache read source
- LocalStack for DynamoDB, SQS, Lambda, IAM and logs
- DynamoDB Admin web UI for browsing LocalStack DynamoDB tables
- backend service wired to those local dependencies
- cache projection queue and lambda for locker cache updates

Important:

- `docker-compose.yml` intentionally overrides AWS endpoints and queue URLs to LocalStack for the `backend` container
- the compose stack uses [`.env.localstack.example`](./.env.localstack.example) as the container env source
- if you run `npm run dev` on the host, backend uses values from `.env`
- if you run `docker compose up backend`, backend uses the compose-local values even if `.env` points to real AWS

If you also want the host-run backend to target LocalStack, copy the local template:

```bash
cp .env.localstack.example .env
```

Compose-exposed ports:

- API: `http://localhost:3555`
- PostgreSQL: `localhost:5433`
- Redis: `localhost:6379`
- LocalStack edge: `http://localhost:4566`
- DynamoDB Admin: `http://localhost:8002`

## 🔎 Route Summary

Primary route groups:

- `GET /health`
- `POST /operations/health`
- `GET /operations/:id`
- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/google`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET /api/v1/cities`
- `GET /api/v1/lockers/boxes`
- `GET /api/v1/lockers/stations`
- `POST /api/v1/bookings/init`
- `GET /api/v1/bookings/:id`
- `POST /api/v1/bookings/:id/extend`
- `POST /api/v1/bookings/:id/cancel`
- `POST /api/v1/payments/webhook`
- admin/operator locker, station, booking, and cache maintenance routes under `/api/v1/*/admin/*` and `/api/v1/lockers/oper/*`

Then start infrastructure:

```bash
docker compose up -d postgres redis localstack
```

Run only Redis locally:

```bash
docker compose up -d redis
```

If you want to run Redis outside Docker Compose:

```bash
docker run --name locker-redis -p 6379:6379 -d redis:7-alpine
```

What LocalStack bootstraps automatically:
- SQS queues:
  - `locker-operations-queue`
  - `locker-dev-cache-projection`
- DynamoDB tables:
  - `locker-dev-operations-dynamodb`
  - `locker-dev-locker-cache`
  - `locker-dev-bookings-dynamodb`
- Local operations Lambda:
  - `locker-command-handler`
- Local cache projection Lambda:
  - `locker-cache-projection-handler`

Current locker cache write path:

`backend -> locker-dev-cache-projection -> locker-cache-projection-handler -> locker-dev-locker-cache`

Booking init, extension, cancellation, and payment confirmation stage booking state in `locker-dev-bookings-dynamodb`.
Station cache is not handled by this lambda flow. Stations remain backend-owned via Redis cache with RDS fallback.

Bootstrap files:

- init script: [01-bootstrap.sh](/Users/dmitrii/Desktop/BackEnd/locker-network-repository/locker-network-repository/backend/docker/localstack/init/01-bootstrap.sh:1)
- TS Lambda source module: [lambda/package.json](/Users/dmitrii/Desktop/BackEnd/locker-network-repository/locker-network-repository/lambda/package.json:1)
- operations handler: [commandHandler.ts](/Users/dmitrii/Desktop/BackEnd/locker-network-repository/locker-network-repository/lambda/src/functions/operations/commandHandler.ts:1)
- cache projection handler: [cacheProjectionHandler.ts](/Users/dmitrii/Desktop/BackEnd/locker-network-repository/locker-network-repository/lambda/src/functions/cache/cacheProjectionHandler.ts:1)

Before starting LocalStack-backed Docker flow, make sure Lambda TS artifacts exist:

```bash
cd ../lambda
npm install
npm run build
cd ../backend
```

Run backend against LocalStack:

```bash
npm run dev
```

Useful checks:

```bash
aws --endpoint-url=http://localhost:4566 sqs list-queues --region eu-west-1
aws --endpoint-url=http://localhost:4566 dynamodb list-tables --region eu-west-1
aws --endpoint-url=http://localhost:4566 lambda list-functions --region eu-west-1
aws --endpoint-url=http://localhost:4566 lambda list-event-source-mappings --region eu-west-1
```

Browse LocalStack DynamoDB tables in the browser:

```bash
docker compose up -d dynamodb-admin
```

Then open `http://localhost:8002`.

### Ports

| Service | Host port | Container port |
|---------|-----------|----------------|
| Backend | 3555 | 3555 |
| PostgreSQL | 5433 | 5432 |
| Redis | 6379 | 6379 |
| LocalStack | 4566 | 4566 |
| DynamoDB Admin | 8002 | 8001 |

### Manual Docker build

```bash
docker build -t locker-backend:latest .

docker run -p 3555:3555 \
  -e DATABASE_URL="postgresql://user:pass@host:5433/locker" \
  -e JWT_ACCESS_SECRET="your-32-char-secret" \
  -e JWT_REFRESH_SECRET="your-32-char-secret" \
  locker-backend:latest
```

---

## 🗄️ Database Migrations

```bash
# Dev — create and apply migration
npx prisma migrate dev --name <migration_name>

# Production — apply existing migrations
npx prisma migrate deploy

# Reset (dev only!)
npx prisma migrate reset

# Regenerate Prisma client after schema changes
npx prisma generate

# GUI browser
npx prisma studio
```

If a schema change requires an index or manual SQL, add it through a Prisma migration instead of applying ad hoc SQL from the README.

Schema: `prisma/schema.prisma`
Migrations: `prisma/migrations/`
Generated client: `@prisma/client`

---

## 🧪 Testing

Current status:

- `npm test` is not implemented yet and exits with an error placeholder
- Jest and Supertest are installed, but the test script still needs to be wired
- Treat this backend as requiring manual verification until the test command is finalized

Useful verification commands right now:

```bash
npm run lint
npm run build
```

---

## 📚 API Documentation

### Swagger UI

Available in development at: **http://localhost:3555/docs**

The source OpenAPI document is [docs/openapi.json](./docs/openapi.json). The matching Postman collection is [postman/locker-backend.postman_collection.json](./postman/locker-backend.postman_collection.json).

### Base URL

```
http://localhost:3555/api/v1
```

### Endpoints

#### System
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/health` | Service health check | — |

The detailed route contracts live next to the owning modules:

- Authentication: [docs/auth.md](./docs/auth.md)
- Cities: [docs/citiesOperations.md](./docs/citiesOperations.md)
- Lockers: [docs/lockers.md](./docs/lockers.md)
- Pricing: [docs/pricing.md](./docs/pricing.md)
- Stations: [docs/stations.md](./docs/stations.md)
- Booking flow: [docs/contracts/booking-flow-contracts.md](./docs/contracts/booking-flow-contracts.md)
- Contract index: [docs/contracts/README.md](./docs/contracts/README.md)
- Cache architecture: [docs/contracts/cache.md](./docs/contracts/cache.md)
- Locker cache DynamoDB contract: [docs/contracts/locker-cache-dynamo.md](./docs/contracts/locker-cache-dynamo.md)
- Security event transport: [docs/contracts/logger-contracts.md](./docs/contracts/logger-contracts.md)
- Security event taxonomy: [docs/contracts/logger-events.md](./docs/contracts/logger-events.md)
- Devices: [docs/devices.md](./docs/devices.md)
- Payments: [docs/payments.md](./docs/payments.md)
- Users: [docs/users.md](./docs/users.md)

---

## 🔑 Authentication Flow

Auth contracts are maintained in [docs/auth.md](./docs/auth.md).

High-level flow:

1. `POST /api/v1/auth/signup` or `POST /api/v1/auth/login` returns an access token and sets the refresh-token cookie.
2. Protected routes use `Authorization: Bearer <accessToken>`.
3. `POST /api/v1/auth/refresh` rotates the refresh session and returns a new access token.
4. `POST /api/v1/auth/logout` revokes the active refresh session.

Current TTLs:

- `accessToken`: 15 minutes
- `refreshToken`: 7 days

---

## 🔒 Security

### Password policy

- Minimum 12 characters
- Must include: uppercase (A-Z), lowercase (a-z), digit (0-9), special character (`!@#$%^&*`)

### Token security

- **Access token**: short-lived (15m), transmitted via `Authorization` header only
- **Refresh token**: long-lived (7d), stored in an `httpOnly` cookie — inaccessible to JavaScript
- **Cookie flags**: in production the cookie is `Secure` + `SameSite=None`; in local development it is `SameSite=Lax` and not `Secure`
- **Token rotation**: every `/refresh` issues a new refresh token and revokes the old refresh session
- **Single active login policy**: every new login revokes all previously active refresh sessions for the same user

### HTTP security headers (Helmet)

- `Content-Security-Policy`
- `Strict-Transport-Security` (HSTS, 1 year + preload)
- `X-Frame-Options`
- `X-Content-Type-Options`

---

## 🚦 Rate Limiting

| Endpoint | Limit | Window | Key |
|----------|-------|--------|-----|
| `POST /api/v1/auth/signup` | 5 req | 1 hour | IP |
| `POST /api/v1/auth/login` | 5 req | 15 min | email + IP |
| `POST /api/v1/auth/refresh` | 100 req | 1 hour | IP (failed only) |
| All other endpoints | 200 req | 1 hour | IP |

Rate limit response:
```json
{
  "status": "error",
  "message": "Too many requests from this IP, please try again in an hour!"
}
```

---

## 📋 Audit Logging

All authentication events are written to the `AuditLog` table in PostgreSQL.

| Action | Trigger |
|--------|---------|
| `USER_REGISTER` | Successful signup |
| `USER_LOGIN` | Successful login |
| `USER_LOGIN_FAILED` | Wrong password or unknown email |
| `USER_LOGOUT` | Logout |
| `TOKEN_REFRESH` | Successful token refresh |
| `TOKEN_REVOKED` | Token version mismatch detected |

Each log entry includes: `actorId`, `action`, `entityType`, `entityId`, `ipAddress`, `userAgent`, `correlationId`, `createdAt`.

---

## 🏥 Health Check

```bash
curl http://localhost:3555/health
```

Response `200 OK`:
```json
{
  "status": "ok",
  "time": "2026-03-21T14:18:31.141Z",
  "source": "mock",
  "uptime": 142,
  "services": {
    "database": { "status": "ok", "latencyMs": 4 }
  }
}
```

Response `503 Service Unavailable` (degraded):
```json
{
  "status": "degraded",
  "time": "2026-03-21T14:18:31.141Z",
  "source": "mock-fallback",
  "services": {
    "database": { "status": "error", "error": "Database unreachable" }
  }
}
```

If `USE_LAMBDA_HEALTH=true` and the Lambda request fails or times out, the backend now falls back to the local DB check and returns `source: "mock-fallback"`.

## 🗃️ Cache Behaviour

Cache details are intentionally split by responsibility:

- overview: [docs/contracts/cache.md](./docs/contracts/cache.md)
- role matrix and read/write paths: [docs/contracts/catalog-cache-and-roles.md](./docs/contracts/catalog-cache-and-roles.md)
- DynamoDB locker projection contract: [docs/contracts/locker-cache-dynamo.md](./docs/contracts/locker-cache-dynamo.md)

Quick summary:

- PostgreSQL is the source of truth.
- Public station reads prefer Redis and can fall back to RDS projections.
- Public locker reads use the DynamoDB locker cache.
- Admin reconcile and resync endpoints are the manual recovery path for cache drift.

## Booking Flow

The canonical booking contract is [docs/contracts/booking-flow-contracts.md](./docs/contracts/booking-flow-contracts.md).

Current high-level flow:

1. `POST /api/v1/bookings/init` enqueues `BOOKING_INIT`.
2. `GET /api/v1/operations/:id` is used for polling async progress and payment session data.
3. `POST /api/v1/payments/webhook` confirms payment and continues the async flow.
4. `GET /api/v1/bookings/:id` reads the staged/final booking state.

API conventions in this flow:

- booking success/error responses use the shared envelope from `src/utils/response.ts`
- async booking mutations return `202 Accepted` once the command is queued successfully
- `GET /api/v1/bookings/my` returns the same public booking shape as `GET /api/v1/bookings/:id`, but as an array

## 🏥 Health Check Async

Async operation handling is documented in [../lambda/README.md](../lambda/README.md) and in the booking contracts for booking-specific commands.

Shared operation statuses:

- `PENDING`
- `PROCESSING`
- `SUCCESS`
- `FAILED`

### Two modes

| `USE_LAMBDA_HEALTH` | Behaviour |
|---------------------|-----------|
| `false` (default) | Node.js queries PostgreSQL directly |
| `true` + valid `LAMBDA_HEALTH_URL` | Calls AWS Lambda first, then falls back to local DB health check on timeout, transport error, or non-`ok` Lambda status |

---

## 📁 Project Structure

```
backend/
├── src/
│   ├── app.ts                          # Entry point, graceful shutdown
│   ├── server.ts                       # Express setup, middleware, routes
│   ├── config/
│   │   └── env.ts                      # Zod environment validation
│   ├── controllers/
│   │   ├── authController.ts           # Auth route handlers
│   │   ├── healthController.ts         # Health route handler
│   │   ├── lockerBoxController.ts      # Locker box handlers
│   │   ├── lockerStationController.ts  # Locker station handlers
│   │   └── operationsController.ts     # Async operation handlers
│   ├── services/
│   │   ├── AuthServiceImplPostgres.ts  # Auth business logic
│   │   ├── CacheSyncService.ts         # Direct cache reconcile for Redis + DynamoDB
│   │   ├── HealthService.ts            # Health check (mock + lambda)
│   │   ├── LockerBoxServiceImplPostgress.ts # Locker CRUD + locker cache reads
│   │   ├── LockerStationServiceImplPostgress.ts # Station CRUD + station cache reads
│   │   ├── OperationService.ts         # Async operation status flow
│   │   ├── dynamoService.ts            # DynamoDB access
│   │   ├── prismaService.ts            # Prisma client wrapper
│   │   ├── sqsService.ts               # SQS dispatch
│   │   └── dto/
│   │       └── applDto.ts              # SignupDto, LoginDto
│   ├── routes/
│   │   ├── authRoutes.ts               # /api/v1/auth/*
│   │   ├── healthRoutes.ts             # /health
│   │   ├── lockersRoutes.ts            # /api/v1/lockers/*
│   │   └── operationsRoutes.ts         # /operations/*
│   ├── middleware/
│   │   ├── authMiddleware.ts           # JWT protect middleware
│   │   └── validateRequest.ts          # Zod request validation
│   ├── errorHandler/
│   │   ├── errorHandler.ts             # Global Express error handler
│   │   └── HttpError.ts                # Custom HTTP error class
│   ├── utils/
│   │   ├── audit.ts                    # Audit log writer
│   │   ├── awsClient.ts                # AWS SDK clients
│   │   ├── awsErrors.ts                # AWS/Dynamo auth error helpers
│   │   ├── jwt.ts                      # Token sign, verify, cookie helpers
│   │   └── sqsClient.ts                # Shared SQS client
│   ├── validation/
│   │   └── authSchemas.ts              # Zod schemas for auth endpoints
│   ├── Logger/
│   │   └── winston.ts                  # Winston logger configuration
│   ├── lib/
│   │   └── prisma.ts                   # Prisma library helpers
│   └── types/
│       └── express.d.ts                # Express Request type extensions
├── prisma/
│   ├── schema.prisma                   # DB schema
│   └── migrations/                     # Migration history
├── docs/
│   └── openapi.json                    # OpenAPI 3.0 spec
├── .env.example                        # Environment template
├── .env                                # Local env (git ignored)
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```
