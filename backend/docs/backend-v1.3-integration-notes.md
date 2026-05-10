# Backend v1.3 Integration Notes

This document lists the changes frontend and Lambda must account for in the current backend version.

## New Backend Behavior

### Operation SSE

Backend now exposes:

- `GET /api/v1/operations/:id/events`
- `GET /operations/:id/events`

The endpoint streams Server-Sent Events over `text/event-stream`.

Events:

- `operation`: current operation payload
- `timeout`: stream timed out; client should fall back to `GET /operations/:id`
- `error`: stream failed; client should fall back or show an error

The existing polling endpoint remains supported:

- `GET /api/v1/operations/:id`
- `GET /operations/:id`

### RDS Audit Logs

Backend now exposes admin RDS audit log reads:

- `GET /api/v1/admin/audit-logs`

Query params:

- `from`
- `to`
- `limit`
- `skip`
- `actorId`
- `lockerId`
- `action`
- `entityType`
- `entityId`

Audit log reads are themselves written as `AUDIT_LOG_READ`.

### CloudWatch Security Alerts

Backend now exposes admin security alert reads from CloudWatch Logs Insights. Alerts are not duplicated into RDS.

- `GET /api/v1/admin/security-alerts`
- `GET /api/v1/admin/security-alerts/cloudwatch` legacy alias

Query params:

- `from`
- `to`
- `limit`
- `severity`
- `eventType`
- `source`
- `actorId`
- `correlationId`

CloudWatch read-through requires `CLOUDWATCH_LOG_GROUP_NAMES`. Urgent notifications should be configured in AWS with CloudWatch Metric Filters/Alarms -> SNS in the account where the source log group or metric exists.

### More Specific GET Queries

The backend now accepts filters and pagination on list endpoints.

Admin users:

- `GET /api/v1/admin/users?role=USER&email=a&name=b&phone=5&includeDeleted=false&limit=50&skip=0`

Bookings:

- `GET /api/v1/bookings/admin?status=ACTIVE&userId=...&stationId=...&lockerBoxId=...&from=...&to=...&limit=50&skip=0`
- `GET /api/v1/bookings/my?status=ACTIVE&stationId=...&lockerBoxId=...&limit=50&skip=0`

Cities:

- `GET /api/v1/cities?code=TLV&name=Tel&limit=50&skip=0`
- `GET /api/v1/cities/sd?code=TLV&name=Tel&limit=50&skip=0`

Lockers and stations:

- `GET /api/v1/lockers/boxes?stationId=...&size=M&status=AVAILABLE&limit=50&skip=0`
- `GET /api/v1/lockers/stations?cityId=...&city=TLV&status=ACTIVE&lat=...&lng=...&radius=...&limit=50&skip=0`
- `GET /api/v1/lockers/admin/boxes?stationId=...&city=TLV&code=A&size=M&status=AVAILABLE&techStatus=ACTIVE&limit=50&skip=0`
- `GET /api/v1/lockers/admin/stations?cityId=...&city=TLV&status=ACTIVE&limit=50&skip=0`
- `GET /api/v1/lockers/oper/stations?cityId=...&city=TLV&status=ACTIVE&limit=50&skip=0`

Pricing:

- `GET /api/v1/pricing?cityId=...&size=M&limit=50&skip=0`

When `limit` is omitted, legacy endpoints keep their existing broad response behavior.

### RDS Booking Expiration Reconciliation

Backend now runs a background job that closes expired RDS bookings:

- finds `Booking.status = ACTIVE`
- checks `expectedEndTime <= now`
- sets booking status to `EXPIRED`
- sets `endTime`
- writes `AuditLog.BOOKING_EXPIRE`

Backend does not change locker status during booking expiration. Locker status and locker cache state are owned by Lambda.

Config:

- `BOOKING_EXPIRATION_DISABLED=false`
- `BOOKING_EXPIRATION_INTERVAL_MS=60000`
- `BOOKING_EXPIRATION_BATCH_SIZE=100`

## Frontend Required Changes

### 1. Add SSE Operation Waiting

Prefer SSE before polling:

```ts
const response = await fetch(`${SERVER_URL}/operations/${operationId}/events`, {
  method: "GET",
  credentials: "include",
  headers: {
    Accept: "text/event-stream",
    Authorization: `Bearer ${accessToken}`,
  },
});
```

Do not use native `EventSource` while access tokens are stored in `localStorage`; native `EventSource` cannot send the `Authorization` header. Use `fetch` stream parsing or a fetch-based SSE library.

Fallback rules:

- if SSE does not open, use `GET /operations/:id`
- if event is `timeout`, use `GET /operations/:id`
- if stream closes before terminal status, use `GET /operations/:id`
- terminal statuses remain `SUCCESS` and `FAILED`

### 2. Use Query Params Instead Of Client-Side Filtering

Move admin/user list filters to backend query params. The main targets are:

- bookings lists
- admin users
- admin lockers
- admin/operator stations
- pricing
- cities

### 3. Handle `meta`

Envelope endpoints return pagination metadata in `meta`:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "limit": 50,
    "skip": 0,
    "total": 123
  }
}
```

Legacy raw-array endpoints, such as `GET /api/v1/admin/users` and `GET /api/v1/pricing`, keep array responses and expose count data through headers:

- `x-total-count`
- `x-limit`
- `x-skip`

### 4. Treat Expired Bookings As Server-Owned State

Do not decide booking expiration only in the browser. Backend now owns RDS expiration state. Frontend should:

- display `bookingStatus = EXPIRED`
- display `lockerStatus = EXPIRED`
- offer extend/reactivate flow only where the existing product flow allows it
- refresh active booking lists after operation success or SSE terminal status

## Lambda Required Changes

### 1. Keep Dynamo Booking TTL Cleanup As Locker-State Owner

Backend now reconciles expired RDS bookings independently, but Lambda still owns locker state. DynamoDB TTL cleanup should:

- if booking is already `EXPIRED`, not fail
- set/reconcile locker cache status to `EXPIRED` for expired active bookings
- remain idempotent when repeated stream events or backend reconciliation have already updated booking state

### 2. Operation Status Contract Is Unchanged

Lambda still writes operation records as:

- `PENDING`
- `PROCESSING`
- `SUCCESS`
- `FAILED`

Backend SSE reads the same operation records. No new SQS command type is required for SSE.

### 3. Cache Projection Still Matters

Backend expiration job does not enqueue locker cache status changes. Lambda remains responsible for locker status/cache transitions caused by booking expiration. Cache projection handler must continue to support normal admin/catalog changes:

- locker cache `UPSERT`
- locker cache `DELETE`
- version checks

### 4. Avoid Reverting RDS Expiration

Any Lambda payment/booking/locker flow that writes back booking or locker state must treat backend-expired RDS rows carefully:

- do not overwrite `Booking.EXPIRED` back to `ACTIVE` unless handling an explicit extend/reactivation operation
- do not expect backend booking expiration to update locker cache; TTL cleanup or explicit locker operation must do that

## Documentation Artifacts Updated

- `backend/docs/openapi.json`
- `backend/postman/locker-backend.postman_collection.json`
- `backend/docker-compose.yml`
- `backend/.env.example`
- `backend/.env.localstack.example`
