# Locker Network — Lambda Functions

Serverless functions for the locker rental system. Handles synchronous health checks via API Gateway and asynchronous operations via SQS + DynamoDB.

## Architecture

### Synchronous

```
Client → GET /health → API Gateway → HealthCheckFunction → JSON response
```

### Asynchronous (SQS → DynamoDB polling)

```
Backend
  ├── 1. Write to OperationsTable: { operationId, status: PENDING }
  ├── 2. Send command to SQS OperationsQueue
  └── 3. Return 202: { operationId }

SQS → CommandHandlerFunction
  ├── Update OperationsTable: status → PROCESSING
  ├── Route by command type → service handler
  └── Update OperationsTable: status → SUCCESS | FAILED (with result payload)

Frontend polls GET /operations/:id until status ≠ PENDING/PROCESSING
```

### Locker Open / Close flow

```
Backend → SQS: { operationId, type: LOCKER_OPEN | LOCKER_CLOSE, payload: { userId, bookingId, lockerBoxId, ... } }

CommandHandler → lockerCommandService
  ├── simulateDeviceCommand() — IoT gateway stub (replace with real HTTP call for production)
  ├── SUCCESS → OperationsTable: { status: SUCCESS, result: { lockStatus, doorStatus } }
  └── FAILED  → OperationsTable: { status: FAILED, errorCode, result: { lockStatus, doorStatus, nextAction } }

Backend (after polling SUCCESS/FAILED):
  ├── Update LockerCacheTable status
  └── Update BookingTable status
```

### Booking end flow

```
Backend → SQS: { operationId, type: BOOKING_END, payload: { userId, stationId, lockerBoxId, bookingId, clientRequestId, requestedAt } }

CommandHandler → bookingEndService
  ├── Load booking from BookingTable
  │     ├── not found            → FAILED (BOOKING_NOT_FOUND)
  │     ├── already ENDED        → SUCCESS (idempotent)
  │     ├── status ≠ ACTIVE      → FAILED (BOOKING_NOT_ACTIVE)
  │     └── userId/stationId/lockerBoxId mismatch → FAILED (LOCKER_BOOKING_MISMATCH)
  ├── Reuse LOCKER_CLOSE device logic (runCloseAttempts, 3 retries)
  │     ├── already LOCKED+CLOSED → skip (user closed it manually)
  │     ├── UNLOCKED+OPEN         → run close attempts
  │     └── other states          → FAILED (LOCKER_STATE_INVALID)
  └── On success:
        ├── BookingTable: status → ENDED, set endTime + updatedAt, ttl=0
        ├── LockerCacheTable: status → AVAILABLE
        └── OperationsTable: SUCCESS with BookingEndResult
```

### Booking TTL cleanup (DynamoDB Streams)

```
BookingTable TTL expires → DynamoDB Stream (REMOVE event) → BookingTtlCleanupFunction
  ├── PENDING booking → release locker (AVAILABLE)
  └── ACTIVE booking  → mark locker EXPIRED, re-insert booking with EXPIRED status
```

### Cache projection (SQS → DynamoDB)

```
Backend → SQS CacheProjectionQueue → CacheProjectionHandlerFunction
  ├── UPSERT (with version check) → LockerCacheTable
  └── DELETE → LockerCacheTable
```

## Tech Stack

- **Runtime:** Node.js 20.x
- **Language:** TypeScript (strict mode, CommonJS)
- **IaC:** AWS SAM (`template.yaml`)
- **AWS Services:** Lambda, API Gateway, SQS, DynamoDB, CloudWatch
- **Payment:** Stripe (booking init creates Checkout session)

## Project Structure

```
lambda/
├── src/
│   ├── functions/
│   │   ├── healthCheck.ts                   # Sync health check (API Gateway)
│   │   ├── booking/
│   │   │   ├── bookingInitService.ts         # Create booking + Stripe Checkout session
│   │   │   ├── bookingExtendService.ts       # Initiate extend + Stripe Checkout
│   │   │   ├── bookingExtendConfirmService.ts # Finalize extend after Stripe webhook
│   │   │   ├── bookingCancelService.ts       # Cancel booking, release locker
│   │   │   ├── bookingEndService.ts          # End active booking, close locker, release
│   │   │   ├── paymentConfirmService.ts      # Confirm Stripe payment, activate booking
│   │   │   └── bookingTtlCleanup.ts          # DynamoDB Streams: handle expired bookings
│   │   ├── cache/
│   │   │   └── cacheProjectionHandler.ts     # Sync locker availability cache from backend
│   │   └── operations/
│   │       ├── commandHandler.ts             # SQS consumer — routes by OperationType
│   │       ├── lambdaHealthService.ts        # HEALTH_CHECK command handler
│   │       ├── securityEventService.ts       # SECURITY_EVENT command handler
│   │       ├── lockerCommandService.ts       # LOCKER_OPEN/CLOSE + batch variants
│   │       └── lockerDeviceSimulator.ts      # IoT device stub (swap for real HTTP in prod)
│   ├── db/
│   │   └── dynamodb.ts                       # DynamoDB client + all table operations
│   ├── types/
│   │   └── contracts/
│   │       ├── BookingContracts.ts
│   │       ├── CacheProjectionContracts.ts
│   │       ├── HealthCheckContracts.ts
│   │       ├── LockerContracts.ts            # LockerErrorCode enum, LockStatus, DoorStatus
│   │       ├── OperationContracts.ts         # OperationType, OperationStatus, SQSCommand
│   │       └── SecurityEventContracts.ts
│   └── utils/
│       └── response.ts                       # HTTP response helpers
├── template.yaml                             # SAM infrastructure definition
├── samconfig.toml                            # SAM deploy settings
├── tsconfig.json
└── package.json
```

## Lambda Functions

| Function | Trigger | Description |
|---|---|---|
| `HealthCheckFunction` | `GET /health` | Sync status endpoint |
| `CommandHandlerFunction` | SQS `OperationsQueue` | Routes all async commands by type |
| `CacheProjectionHandlerFunction` | SQS `CacheProjectionQueue` | Upserts/deletes locker cache entries |
| `BookingTtlCleanupFunction` | DynamoDB Streams `BookingTable` | Releases or expires lockers on TTL |

## Command Types (OperationsQueue)

| Type | Handler | Description |
|---|---|---|
| `HEALTH_CHECK` | `lambdaHealthService` | Lambda liveness check |
| `SECURITY_EVENT` | `securityEventService` | Log security events |
| `BOOKING_INIT` | `bookingInitService` | Create booking + Stripe Checkout |
| `PAYMENT_CONFIRM` | `paymentConfirmService` | Confirm payment, activate booking |
| `BOOKING_EXTEND` | `bookingExtendService` | Start extend flow + Stripe Checkout |
| `BOOKING_EXTEND_CONFIRM` | `bookingExtendConfirmService` | Finalize extend after Stripe webhook |
| `BOOKING_CANCEL` | `bookingCancelService` | Cancel booking, release locker |
| `BOOKING_END` | `bookingEndService` | End active booking, close locker, mark cache `AVAILABLE` |
| `LOCKER_OPEN` | `lockerCommandService` | Open locker door via device |
| `LOCKER_CLOSE` | `lockerCommandService` | Close and lock locker via device |
| `LOCKER_OPEN_BATCH` | `lockerCommandService` | Batch open (operator/admin maintenance) |
| `LOCKER_CLOSE_BATCH` | `lockerCommandService` | Batch close (operator/admin maintenance) |

## DynamoDB Tables

| Table | Key | Purpose |
|---|---|---|
| `locker-{env}-operations-dynamodb` | `operationId` | Async operation state (PENDING → SUCCESS/FAILED) |
| `locker-{env}-booking` | `bookingId` | Bookings with TTL + DynamoDB Streams (GSI: `GSI1` on `GSI1PK = userId`) |
| `locker-{env}-locker-cache` | `lockerBoxId` | Real-time locker availability (GSI: `stationId-index`) |
| `locker-{env}-device-state` | `lockerBoxId` | Sensor-reported lock + door state (GSI: `stationId-index`) |

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [AWS CLI](https://aws.amazon.com/cli/)
- [AWS SAM CLI](https://github.com/aws/aws-sam-cli/releases/latest/download/AWS_SAM_CLI_64_PY3.msi)

```bash
node --version   # v20+
docker --version # Docker Desktop running
aws --version
sam --version
```

## Installation

```bash
cd lambda
npm install
npm run build
```

## Local Development

```bash
npm run build          # compile TypeScript → dist/
sam build              # build SAM package
sam local start-api    # API Gateway on port 3000
```

```bash
# Test health check
curl.exe http://localhost:3000/health
```

> After editing `.ts` files, re-run `npm run build` before testing.  
> On Windows PowerShell, use `curl.exe` (not `curl`).

## Deployment

```bash
# First time
npm run build && sam build && sam deploy --guided

# Subsequent deploys
npm run build && sam build && sam deploy
```

## Testing SQS Commands

Create `message.json` and send via AWS CLI:

```bash
# LOCKER_OPEN example
aws sqs send-message \
  --queue-url "QUEUE_URL_FROM_OUTPUTS" \
  --message-body file://message.json \
  --region eu-west-1
```

```json
{
  "operationId": "op_open_001",
  "type": "LOCKER_OPEN",
  "payload": {
    "userId": "user_123",
    "bookingId": "bk_001",
    "lockerBoxId": "locker_55",
    "stationId": "station_123",
    "clientRequestId": "req_001",
    "requestedAt": "2026-04-25T10:00:00.000Z"
  }
}
```

## Contracts

### Operation lifecycle

```
PENDING → PROCESSING → SUCCESS | FAILED
```

### LOCKER_OPEN / LOCKER_CLOSE — SUCCESS result

```json
{
  "operationId": "op_open_001",
  "type": "LOCKER_OPEN",
  "status": "SUCCESS",
  "bookingId": "bk_001",
  "lockerBoxId": "locker_55",
  "result": {
    "lockStatus": "UNLOCKED",
    "doorStatus": "OPEN",
    "message": "Locker opened"
  },
  "timestamp": "2026-04-25T10:00:01.000Z"
}
```

### LOCKER_OPEN / LOCKER_CLOSE — FAILED result

```json
{
  "operationId": "op_open_001",
  "type": "LOCKER_OPEN",
  "status": "FAILED",
  "bookingId": "bk_001",
  "lockerBoxId": "locker_55",
  "result": {
    "lockStatus": "LOCKED",
    "doorStatus": "CLOSED",
    "nextAction": "CHANGE_LOCKER"
  },
  "errorCode": "LOCK_OPEN_FAILED",
  "errorMessage": "Locker lock failed to unlock",
  "timestamp": "2026-04-25T10:00:02.000Z"
}
```

### Error codes (`LockerErrorCode`)

| Code | Category | Description |
|---|---|---|
| `BOOKING_NOT_FOUND` | Validation | Booking does not exist |
| `ACCESS_DENIED` | Validation | User does not own this booking |
| `BOOKING_NOT_ACTIVE` | Validation | Booking is not in ACTIVE status |
| `BOOKING_EXPIRED` | Validation | Booking TTL has passed |
| `LOCKER_BOOKING_MISMATCH` | Validation | lockerBoxId does not match booking |
| `LOCK_OPEN_FAILED` | Device | Lock mechanism failed to disengage |
| `DOOR_OPEN_FAILED` | Device | Lock disengaged but door did not open |
| `LOCK_CLOSE_FAILED` | Device | Lock failed to engage after close |
| `DOOR_CLOSE_FAILED` | Device | Door failed to close |
| `LOCKER_STATE_INVALID` | System | Unexpected device state |
| `DEVICE_SIMULATION_FAILED` | System | Unhandled exception in device layer |
| `OPEN_ATTEMPTS_EXHAUSTED` | System | All retry attempts to open failed |
| `CLOSE_ATTEMPTS_EXHAUSTED` | System | All retry attempts to close failed |
| `BATCH_OPEN_FAILED` | System | Batch open operation failed |
| `BATCH_CLOSE_FAILED` | System | Batch close operation failed |

## CloudWatch Logs

```
CloudWatch → Log groups → /aws/lambda/locker-dev-command-handler
CloudWatch → Log groups → /aws/lambda/locker-dev-health-check
```

```bash
sam logs --name CommandHandlerFunction --stack-name locker-lambda-dev --region eu-west-1
```

## Deployed Resources

| Resource | Type | Value |
|---|---|---|
| Health Check | API Gateway | `https://0kvn3au8e9.execute-api.eu-west-1.amazonaws.com/Prod/health` |
| Operations Queue | SQS | `https://sqs.eu-west-1.amazonaws.com/131904957044/locker-dev-operations-queue` |
| Operations Queue ARN | SQS | `arn:aws:sqs:eu-west-1:131904957044:locker-dev-operations-queue` |
| Operations Table | DynamoDB | `locker-dev-operations-dynamodb` |
| Region | — | `eu-west-1` |

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NODE_ENV` | `dev` / `staging` / `prod` |
| `STRIPE_SECRET_KEY` | Stripe API key (booking init) |
| `OPERATIONS_TABLE` | DynamoDB operations table name |
| `BOOKING_TABLE` | DynamoDB booking table name |
| `LOCKER_CACHE_TABLE` | DynamoDB locker cache table name |
| `LOCKER_DEVICE_STATE_TABLE` | DynamoDB sensor state table name |
| `FRONTEND_BASE_URL` | Used in Stripe success/cancel URLs |

## Team

- **Lambda:** Egor, Anna
- **Backend (API):** Dmitrii B, Liza, Mark, Igor
