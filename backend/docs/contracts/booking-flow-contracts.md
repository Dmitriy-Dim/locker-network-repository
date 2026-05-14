# Booking Flow Contracts

Этот файл фиксирует целевые контракты для полного цикла бронирования и оплаты в текущей архитектуре:

- `backend` принимает HTTP-запросы и Stripe webhook
- `backend` отправляет команды в SQS
- `lambda` работает с DynamoDB и locker cache
- `backend` финализирует запись в RDS при polling операции

Все HTTP success-ответы ниже обернуты в общий backend envelope:

```json
{
  "success": true,
  "status": "success",
  "correlationId": "optional",
  "data": {}
}
```

Для async booking-mutations успешная постановка в очередь возвращается как `202 Accepted`.

## 1. HTTP API

### `POST /api/v1/bookings/init`

Request:

```json
{
  "stationId": "station_123",
  "size": "M",
  "expectedEndTime": "2026-04-20T10:00:00Z"
}
```

Backend action:

- генерирует `operationId`
- создает operation record `PENDING` в DynamoDB через `operationRepository`
- отправляет SQS команду `BOOKING_INIT`

Lambda action:

- создает operation record в DynamoDB со статусом `PENDING`
- переводит operation в `PROCESSING`
- выбирает `AVAILABLE` locker в `locker cache` по `stationId + size`
- переводит locker в `RESERVED`
- создает staging booking `PENDING` в bookings DynamoDB
- создает Stripe Checkout session и записывает `paymentSessionId`, `paymentIntentId`, `paymentUrl`

SQS message:

```json
{
  "operationId": "op_001",
  "type": "BOOKING_INIT",
  "payload": {
    "userId": "user_123",
    "stationId": "station_123",
    "size": "M",
    "expectedEndTime": "2026-04-20T10:00:00Z"
  }
}
```

HTTP response:

```json
{
  "success": true,
  "status": "success",
  "data": {
    "operationId": "op_001",
    "status": "PENDING",
    "type": "BOOKING_INIT",
    "message": "Booking initialization started"
  }
}
```

### `GET /api/v1/operations/:id`

Используется фронтом для polling статуса инициализации и завершения оплаты.

Response before payment:

```json
{
  "success": true,
  "status": "success",
  "data": {
    "operationId": "op_001",
    "type": "BOOKING_INIT",
    "status": "SUCCESS",
    "timestamp": "2026-04-19T12:00:03Z",
    "data": {
      "bookingId": "bk_001",
      "lockerBoxId": "locker_55",
      "bookingStatus": "PENDING",
      "expiresAt": "2026-04-19T12:15:00Z",
      "price": 24.0,
      "currency": "ILS",
      "payment": {
        "provider": "stripe",
        "paymentSessionId": "cs_test_123",
        "paymentIntentId": "pi_123",
        "paymentUrl": "https://checkout.stripe.com/..."
      }
    }
  }
}
```

### `GET /api/v1/operations/:id/events`

Preferred read channel for operation completion. The old polling endpoint remains as fallback.

Response content type:

```text
text/event-stream
```

Events:

- `operation`: operation payload
- `timeout`: stream timed out; frontend should fall back to `GET /operations/:id`
- `error`: stream failed

Example:

```text
event: operation
data: {"operationId":"op_001","type":"BOOKING_INIT","status":"SUCCESS"}
```

Because the frontend stores access tokens in `localStorage`, use a fetch-based SSE client that can send `Authorization: Bearer <token>`. Native `EventSource` is not enough unless auth is moved to cookies.

Response after payment confirmation and RDS finalization:

```json
{
  "success": true,
  "status": "success",
  "data": {
    "operationId": "op_001",
    "status": "SUCCESS",
    "type": "BOOKING_INIT",
    "timestamp": "2026-04-19T12:00:03Z",
    "data": {
      "bookingId": "bk_001",
      "paymentStatus": "PAID",
      "bookingStatus": "ACTIVE",
      "lockerBoxId": "locker_55",
      "stationId": "station_123",
      "startTime": "2026-04-19T12:03:00Z",
      "expectedEndTime": "2026-04-20T10:00:00Z"
    }
  }
}
```

### `GET /api/v1/bookings/:id`

Чистый read-path по staging booking из DynamoDB.

Response:

```json
{
  "success": true,
  "status": "success",
  "data": {
    "bookingId": "bk_001",
    "paymentStatus": "PENDING",
    "bookingStatus": "PENDING",
    "lockerStatus": "RESERVED",
    "lockerBoxId": "locker_55",
    "stationId": "station_123",
    "startTime": null,
    "expectedEndTime": "2026-04-20T10:00:00Z"
  }
}
```

### `GET /api/v1/bookings/my`

Query params:

- `status`
- `stationId`
- `lockerBoxId`
- `limit`
- `skip`

Response:

```json
{
  "success": true,
  "status": "success",
  "data": [
    {
      "bookingId": "bk_001",
      "paymentStatus": "PAID",
      "bookingStatus": "ACTIVE",
      "lockerStatus": "OCCUPIED",
      "lockerBoxId": "locker_55",
      "stationId": "station_123",
      "startTime": "2026-04-19T12:03:00Z",
      "expectedEndTime": "2026-04-20T10:00:00Z"
    }
  ]
}
```

### Expiration Reconciliation

Backend now owns RDS booking expiration as a background reconciliation job.

Every `BOOKING_EXPIRATION_INTERVAL_MS`, backend scans `ACTIVE` RDS bookings with `expectedEndTime <= now` and:

- sets booking status to `EXPIRED`
- sets `endTime`
- writes `AuditLog.BOOKING_EXPIRE`
- does not change locker status or locker cache

Lambda remains the owner of locker status/cache transitions caused by booking expiration.

Lambda DynamoDB TTL cleanup remains responsible for Dynamo booking/cache state and must stay idempotent when backend has already expired the RDS row.

### `POST /api/v1/payments/webhook`

Backend принимает реальный Stripe webhook в raw-body формате и валидирует подпись `stripe-signature`.

Из Stripe event извлекаются:

- `bookingId`
- `paymentSessionId`
- `providerPaymentId`
- `amount`
- `currency`

После валидации backend отправляет `PAYMENT_CONFIRM` в SQS.

SQS message:

```json
{
  "operationId": "op_001",
  "type": "PAYMENT_CONFIRM",
  "payload": {
    "bookingId": "bk_001",
    "paymentSessionId": "cs_test_123",
    "providerPaymentId": "pi_123",
    "amount": 24.0,
    "currency": "ILS"
  }
}
```

Backend response:

```json
{
  "success": true,
  "status": "success",
  "data": {
    "received": true,
    "accepted": true,
    "bookingId": "bk_001",
    "paymentConfirmedAt": "2026-04-19T12:03:00Z",
    "eventId": "evt_123"
  }
}
```

## 2. DynamoDB Contracts

### `locker-dev-operations-dynamodb`

PK: `operationId`

```json
{
  "operationId": "op_001",
  "type": "BOOKING_INIT",
  "status": "SUCCESS",
  "userId": "user_123",
  "bookingId": "bk_001",
  "lockerBoxId": "locker_55",
  "result": {
    "bookingStatus": "PENDING",
    "expiresAt": "2026-04-19T12:15:00Z",
    "price": 24.0,
    "currency": "ILS",
    "payment": {
      "provider": "stripe",
      "paymentSessionId": "cs_test_123",
      "paymentIntentId": "pi_123",
      "paymentUrl": "https://checkout.stripe.com/..."
    }
  },
  "errorMessage": null,
  "timestamp": "2026-04-19T12:00:00Z"
}
```

Supported `type` values:

- `HEALTH_CHECK`
- `SECURITY_EVENT`
- `BOOKING_INIT`
- `BOOKING_EXTEND`
- `BOOKING_EXTEND_CONFIRM`
- `PAYMENT_CONFIRM`

Supported `status` values:

- `PENDING`
- `PROCESSING`
- `SUCCESS`
- `FAILED`

### `locker-dev-bookings-dynamodb`

PK: `bookingId`
GSI: `GSI1` with partition key `GSI1PK = userId`

Initial pending booking:

```json
{
  "bookingId": "bk_001",
  "operationId": "op_001",
  "userId": "user_123",
  "GSI1PK": "user_123",
  "stationId": "station_123",
  "lockerBoxId": "locker_55",
  "size": "M",
  "status": "PENDING",
  "paymentStatus": "PENDING",
  "expectedEndTime": "2026-04-20T10:00:00Z",
  "expiresAt": "2026-04-19T12:15:00Z",
  "ttl": 1776591300,
  "price": 24.0,
  "currency": "ILS",
  "paymentProvider": "stripe",
  "paymentSessionId": "cs_test_123",
  "paymentIntentId": "pi_123",
  "paymentUrl": "https://checkout.stripe.com/...",
  "providerPaymentId": null,
  "paymentConfirmedAt": null,
  "createdAt": "2026-04-19T12:00:00Z",
  "updatedAt": "2026-04-19T12:00:00Z"
}
```

After successful payment:

```json
{
  "bookingId": "bk_001",
  "operationId": "op_001",
  "userId": "user_123",
  "stationId": "station_123",
  "lockerBoxId": "locker_55",
  "size": "M",
  "status": "PAYMENT_CONFIRMED",
  "paymentStatus": "PAID",
  "expectedEndTime": "2026-04-20T10:00:00Z",
  "expiresAt": "2026-04-19T12:15:00Z",
  "ttl": 1776591300,
  "price": 24.0,
  "currency": "ILS",
  "paymentProvider": "stripe",
  "paymentSessionId": "cs_test_123",
  "paymentIntentId": "pi_123",
  "paymentUrl": "https://checkout.stripe.com/...",
  "providerPaymentId": "pi_123",
  "paymentConfirmedAt": "2026-04-19T12:03:00Z",
  "createdAt": "2026-04-19T12:00:00Z",
  "updatedAt": "2026-04-19T12:03:00Z"
}
```

Supported staging `status` values:

- `PENDING`
- `PAYMENT_CONFIRMED`
- `ACTIVE`
- `CANCELLED`
- `EXPIRED`

Supported staging `paymentStatus` values:

- `PENDING`
- `PAID`
- `FAILED`
- `REFUNDED`

Additional staged fields for extension payment:

- `pendingExtendEndTime`
- `extendPaymentStatus`
- `extendPaymentSessionId`
- `extendPaymentIntentId`
- `extendPaymentUrl`
- `extendAmount`
- `extendCurrency`
- `extendProviderPaymentId`
- `extendPaymentConfirmedAt`

The backend webhook reads `operationId` for booking extension confirmation from Stripe Checkout `metadata.operationId`.

### `locker-dev-locker-cache`

PK: `lockerBoxId`

```json
{
  "lockerBoxId": "locker_55",
  "stationId": "station_123",
  "code": "A007",
  "size": "L",
  "status": "AVAILABLE",
  "version": 4,
  "lastStatusChangedAt": "2026-04-15T11:45:00Z",
  "pricePerHour": "15.00",
  "station": {
    "address": "HaNamal 12",
    "latitude": 32.821,
    "longitude": 34.998,
    "status": "ACTIVE",
    "city": {
      "code": "HFA",
      "name": "Haifa"
    }
  }
}
```

Supported `status` values:

- `AVAILABLE`
- `RESERVED`
- `OCCUPIED`
- `FAULTY`
- `EXPIRED`

`BOOKING_INIT` должен переводить locker в `RESERVED`.

## 3. Lambda Responsibilities

### `BOOKING_INIT`

Lambda должна:

- найти доступный locker в `locker-dev-locker-cache`
- проверить station и locker state
- обновить locker status в cache до `RESERVED`
- создать staging booking в `locker-dev-booking`
- обновить operation в `locker-dev-operations-dynamodb` до `SUCCESS`

### `PAYMENT_CONFIRM`

Lambda должна:

- прочитать booking из `locker-dev-booking`
- проверить:
  - booking существует
  - TTL не истек
  - booking не `ACTIVE`
  - booking еще не `PAID`
  - `paymentSessionId` совпадает
- обновить booking:
  - `status -> PAYMENT_CONFIRMED`
  - `paymentStatus -> PAID`
  - `providerPaymentId -> providerPaymentId`
  - `amount -> amount`
  - `currency -> currency`
  - `paymentConfirmedAt -> now`
  - `updatedAt -> now`

## 4. RDS Finalization

Финализация происходит на стороне backend при polling `GET /api/v1/operations/:operationId`.

Если operation содержит `bookingId`, а соответствующий booking в Dynamo уже в `PAYMENT_CONFIRMED`, backend идемпотентно создает:

### Prisma `Booking`

```json
{
  "bookingId": "bk_001",
  "userId": "user_123",
  "lockerBoxId": "locker_55",
  "stationId": "station_123",
  "status": "ACTIVE",
  "startTime": "2026-04-19T12:03:00Z",
  "expectedEndTime": "2026-04-20T10:00:00Z",
  "totalPrice": 24.0
}
```

### Prisma `Payment`

```json
{
  "paymentId": "pay_001",
  "bookingId": "bk_001",
  "status": "PAID",
  "provider": "stripe",
  "providerPaymentId": "pi_123",
  "amount": 24.0,
  "currency": "ILS",
  "paidAt": "2026-04-19T12:03:00Z"
}
```

For booking extensions, PostgreSQL stores an additional `Payment` row with the same `bookingId` and a new `paymentId`. `bookingId` is no longer unique in `Payment`.

### Prisma `AuditLog`

```json
{
  "action": "PAYMENT_CONFIRM",
  "entityType": "Booking",
  "entityId": "bk_001",
  "lockerId": "locker_55",
  "details": {
    "bookingId": "bk_001",
    "paymentSessionId": "cs_test_123",
    "providerPaymentId": "pi_123",
    "amount": 24.0,
    "currency": "ILS"
  }
}
```

## 5. End-to-End Cycle

1. Frontend вызывает `POST /api/v1/bookings/init`
2. Backend генерирует `operationId` и отправляет SQS message `BOOKING_INIT`
3. Lambda создает operation record `PENDING`, переводит его в `PROCESSING`, резервирует locker, создает staging booking `PENDING` и Stripe Checkout session
4. Frontend поллит `GET /api/v1/operations/:id`
5. Frontend получает `bookingId`, `expiresAt`, `price`, `currency`, `payment`
6. Frontend уходит на Stripe Checkout по `paymentUrl`
7. Stripe отправляет webhook на `POST /api/v1/payments/webhook`
8. Backend валидирует webhook и отправляет `PAYMENT_CONFIRM`
9. Lambda переводит booking в `PAYMENT_CONFIRMED`
10. Frontend продолжает polling `GET /api/v1/operations/:id`
11. Backend видит `PAYMENT_CONFIRMED`, один раз создает записи в RDS и возвращает `ACTIVE`

## 6. Booking Extension Payment

1. Frontend вызывает `POST /api/v1/bookings/:bookingId/extend`
{
   "bookingId": "bk_123",
   "expectedEndTime": "2026-04-20T10:00:00Z"
   }
2. Backend генерирует `operationId` и отправляет SQS message `BOOKING_EXTEND`
   HTTP immediately returns `202 Accepted`:
   ```json
   {
     "success": true,
     "status": "success",
     "data": {
       "operationId": "op_002",
       "status": "PENDING",
       "type": "BOOKING_EXTEND",
       "bookingId": "bk_123",
       "lockerBoxId": "locker_55",
       "currentBookingStatus": "ACTIVE",
       "currentLockerStatus": "OCCUPIED",
       "requestedExpectedEndTime": "2026-04-20T10:00:00Z"
     }
   }
   ```
3. Lambda валидирует текущее состояние booking/locker в DynamoDB
4. Lambda рассчитывает стоимость продления, создает Stripe Checkout session и сохраняет staged extension payment fields в booking item
5. Frontend поллит `GET /api/v1/operations/:id`
6. Frontend получает `payment.paymentUrl` и уходит на Stripe Checkout
7. Stripe отправляет webhook на `POST /api/v1/payments/webhook` с `metadata.paymentFlow = BOOKING_EXTEND`
8. Backend пишет дополнительную payment row в RDS и отправляет `BOOKING_EXTEND_CONFIRM`
9. Lambda подтверждает extension payment, обновляет booking `expectedEndTime` в DynamoDB и при `EXPIRED/EXPIRED` переводит booking/locker в `ACTIVE/OCCUPIED`

## 7. Booking Cancel and Admin Status Update

### `POST /api/v1/bookings/:id/cancel`

If booking is not already cancelled, backend updates PostgreSQL status to `CANCELLED`, enqueues `BOOKING_CANCEL`, and returns:

```json
{
  "success": true,
  "status": "success",
  "data": {
    "operationId": "op_003",
    "status": "PENDING",
    "type": "BOOKING_CANCEL",
    "bookingId": "bk_001",
    "persistedStatus": "CANCELLED",
    "message": "Booking cancellation queued"
  }
}
```

If the booking is already cancelled, backend returns `200 OK` with the current booking snapshot fragment:

```json
{
  "success": true,
  "status": "success",
  "data": {
    "bookingId": "bk_001",
    "bookingStatus": "CANCELLED",
    "lockerStatus": "AVAILABLE",
    "message": "Booking already cancelled"
  }
}
```

### `POST /api/v1/bookings/:id/end`

User or admin can end only an `ACTIVE` booking. Backend creates a pending operation, updates PostgreSQL status to `ENDED`, stores `endTime`, enqueues `BOOKING_END` for lambda locker close/cache cleanup, and returns:

```json
{
  "success": true,
  "status": "success",
  "data": {
    "operationId": "op_end_001",
    "status": "PENDING",
    "type": "BOOKING_END",
    "bookingId": "bk_001",
    "lockerBoxId": "locker_55",
    "stationId": "station_123",
    "requestedStatus": "ENDED",
    "persistedStatus": "ENDED",
    "finalClose": true,
    "message": "Booking end queued"
  }
}
```

If the booking is already ended, backend returns `200 OK`. For `PENDING`, `CANCELLED`, `EXPIRED`, or other non-active states backend returns `409`.

### `PATCH /api/v1/bookings/admin/:id/status`

Admin status change updates PostgreSQL first, enqueues `BOOKING_UPDATE_STATUS`, and returns `202 Accepted`:

```json
{
  "success": true,
  "status": "success",
  "data": {
    "operationId": "op_004",
    "status": "PENDING",
    "type": "BOOKING_UPDATE_STATUS",
    "bookingId": "bk_001",
    "requestedStatus": "ENDED",
    "persistedStatus": "ENDED",
    "message": "Booking status update queued"
  }
}
```
