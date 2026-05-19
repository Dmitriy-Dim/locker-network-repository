## Bookings

This file is kept only as a compatibility pointer.

The canonical booking contracts now live in [contracts/booking-flow-contracts.md](./contracts/booking-flow-contracts.md).

Why this file was reduced:

- the older `POST /api/v1/bookings` contract conflicted with the current async flow
- request and response examples were duplicated across multiple backend documents
- SQS, DynamoDB staging, and payment-confirmation details now have a single source of truth

Use these documents instead:

- end-to-end booking API and storage contracts: [contracts/booking-flow-contracts.md](./contracts/booking-flow-contracts.md)
- backend overview and local setup: [README.md](./README.md)

Current API convention reminder:

- booking endpoints use the shared success/error envelope from `backend/src/utils/response.ts`
- async booking mutations (`init`, `extend`, queued cancel/status updates) respond with `202 Accepted` when the operation is queued successfully

## Current backend endpoints

### User/admin booking reads and mutations

| Method | Path | Roles | Notes |
|---|---|---|---|
| `POST` | `/api/v1/bookings/init` | user | Queues `BOOKING_INIT`; returns an operation id and Stripe Checkout session data through operation polling. |
| `GET` | `/api/v1/bookings/my` | user | Lists current user's bookings. Query params: `status`, `stationId`, `lockerBoxId`, `limit`, `skip`. |
| `GET` | `/api/v1/bookings/:id` | user, operator, admin | Returns one booking. Users can read only their own booking. |
| `POST` | `/api/v1/bookings/:id/cancel` | user, admin | Queues/executes cancellation flow and releases locker when valid. |
| `POST` | `/api/v1/bookings/:id/end` | user, admin | Queues booking end flow and locker close command. |
| `POST` | `/api/v1/bookings/:id/extend` | user | Queues extension payment flow. Body: `{ "expectedEndTime": "<ISO datetime>" }`. |
| `GET` | `/api/v1/bookings/:id/payments` | admin | Returns payment records for the booking from PostgreSQL. |

### Admin booking operations

| Method | Path | Roles | Notes |
|---|---|---|---|
| `GET` | `/api/v1/bookings/admin` | admin | Lists bookings from PostgreSQL. Query params: `status`, `userId`, `stationId`, `lockerBoxId`, `from`, `to`, `limit`, `skip`. |
| `GET` | `/api/v1/bookings/admin/:id` | admin | Returns one booking with payment records from PostgreSQL. |
| `PATCH` | `/api/v1/bookings/admin/:id/status` | admin | Updates PostgreSQL status and queues `BOOKING_UPDATE_STATUS`; responds `202 Accepted`. |
| `POST` | `/api/v1/bookings/admin/reconcile-dynamo-rds` | admin | Reads staged DynamoDB bookings and upserts them into PostgreSQL. |

### POST /api/v1/bookings/admin/reconcile-dynamo-rds

- Roles: admin
- Source: DynamoDB booking table
- Target: PostgreSQL booking table
- Use for local/admin recovery when staged booking state needs to be backfilled into RDS

Example `200 OK` response:

```json
{
  "success": true,
  "status": "success",
  "correlationId": "9b7b8a5f-7a35-4aa3-a3d2-9d366c10a8ab",
  "data": {
    "total": 12,
    "created": 2,
    "updated": 9,
    "skipped": 1,
    "failures": []
  },
  "meta": {
    "sourceOfTruth": "dynamodb",
    "target": "postgres",
    "failureCount": 0
  }
}
```

Responses:

- `200 OK` - reconcile completed; some records can still be skipped and listed in `failures`
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `500 Internal Server Error` - DynamoDB/RDS/reconcile failure

### GET /api/v1/bookings/:id/payments

- Roles: admin
- Source: PostgreSQL
- Returns all payment rows attached to one booking id

Example `200 OK` response:

```json
{
  "success": true,
  "status": "success",
  "correlationId": "56b694e6-7a59-4c30-9a10-269b3fd234ab",
  "data": {
    "payments": [
      {
        "paymentId": "3e6ef0c0-95fb-46d4-9860-deae74c91a4b",
        "bookingId": "478ebbcd-00d8-4e75-9a67-0b1212215067",
        "status": "PAID",
        "provider": "stripe",
        "providerPaymentId": "pi_3TUW1nGaoUSS09Qr1iRZ9ZBM",
        "amount": "30",
        "currency": "ILS",
        "paidAt": "2026-05-07T17:48:05.000Z",
        "createdAt": "2026-05-07T17:48:05.801Z",
        "updatedAt": "2026-05-07T17:48:05.801Z"
      }
    ]
  }
}
```

Responses:

- `200 OK` - booking payments returned
- `400 Bad Request` - invalid booking id
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `404 Not Found` - booking not found
- `500 Internal Server Error` - unexpected repository/service failure
