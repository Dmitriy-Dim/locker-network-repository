## HTTP endpoint

### POST /api/v1/devices/replace-locker

Role:

```text
USER
```

Headers:

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
Idempotency-Key: optional-client-key
```

Request body:

```json
{
  "bookingId": "13d96d5a-de94-4065-ac0b-9a4caf62a2a8",
  "stationId": "fe57053f-4861-4277-bf3c-6a9bedbdb115",
  "lockerBoxId": "a8430e99-a087-48d5-9e56-dc399158f867",
  "failedOperationId": "6be0b5d3-73c1-4359-8241-81ebc62fa461",
  "failedOperationType": "LOCKER_OPEN",
  "reason": "OPEN_ATTEMPTS_EXHAUSTED",
  "clientRequestId": "replace-req-001"
}
```

Required fields:

```text
bookingId
stationId
lockerBoxId
```

Optional fields:

```text
failedOperationId
failedOperationType
reason
clientRequestId
```

`failedOperationType` can be:

```text
LOCKER_OPEN
LOCKER_CLOSE
```

### Backend validation

Backend validates:

- bearer token exists and is valid;
- authenticated user has role `USER`;
- `bookingId`, `stationId`, `lockerBoxId` are valid UUIDs;
- `failedOperationId`, if present, is a valid UUID;
- `failedOperationType`, if present, is `LOCKER_OPEN` or `LOCKER_CLOSE`.

Current endpoint does not search replacement locker and does not perform the replacement itself.

### Backend response

Example `202 Accepted` response:

```json
{
  "operationId": "f7e6a0cb-ea07-44f5-9837-d33470833c04",
  "status": "PENDING",
  "type": "LOCKER_REPLACE",
  "message": "Locker replace command accepted"
}
```

If the shared response envelope is applied later, the same payload should be placed into `data`:

```json
{
  "success": true,
  "status": "success",
  "correlationId": "optional-correlation-id",
  "data": {
    "operationId": "f7e6a0cb-ea07-44f5-9837-d33470833c04",
    "status": "PENDING",
    "type": "LOCKER_REPLACE",
    "message": "Locker replace command accepted"
  }
}
```

Responses:

- `202 Accepted` - SQS command sent, response contains created operation id;
- `400 Bad Request` - invalid body;
- `401 Unauthorized` - missing bearer token or invalid token;
- `403 Forbidden` - authenticated user does not have role `USER`;
- `500 Internal Server Error` - operation creation or SQS sending failed.

## Backend operation record

Before sending the SQS command, backend creates operation:

```json
{
  "operationId": "f7e6a0cb-ea07-44f5-9837-d33470833c04",
  "userId": "user_123",
  "timestamp": "2026-05-24T12:00:00.000Z",
  "status": "PENDING",
  "type": "LOCKER_REPLACE"
}
```

## SQS command

Backend sends command to the same queue pattern as `LOCKER_OPEN` and `LOCKER_CLOSE`.

SQS message body:

```json
{
  "operationId": "f7e6a0cb-ea07-44f5-9837-d33470833c04",
  "type": "LOCKER_REPLACE",
  "payload": {
    "userId": "user_123",
    "bookingId": "13d96d5a-de94-4065-ac0b-9a4caf62a2a8",
    "stationId": "fe57053f-4861-4277-bf3c-6a9bedbdb115",
    "lockerBoxId": "a8430e99-a087-48d5-9e56-dc399158f867",
    "failedOperationId": "6be0b5d3-73c1-4359-8241-81ebc62fa461",
    "failedOperationType": "LOCKER_OPEN",
    "reason": "OPEN_ATTEMPTS_EXHAUSTED",
    "clientRequestId": "replace-req-001",
    "requestedAt": "2026-05-24T12:00:00.000Z"
  }
}
```

Field meaning:

| Field | Required | Meaning |
|---|---:|---|
| `operationId` | yes | New `LOCKER_REPLACE` operation id created by backend. |
| `type` | yes | Must be `LOCKER_REPLACE`. |
| `payload.userId` | yes | User that owns or initiated the operation. |
| `payload.bookingId` | yes | Booking where locker must be replaced. |
| `payload.stationId` | yes | Station where Lambda must search replacement locker. |
| `payload.lockerBoxId` | yes | Old/problem locker box id. |
| `payload.failedOperationId` | no | Previous failed open/close operation id. |
| `payload.failedOperationType` | no | `LOCKER_OPEN` or `LOCKER_CLOSE`. |
| `payload.reason` | no | Failure reason, for example `OPEN_ATTEMPTS_EXHAUSTED`. |
| `payload.clientRequestId` | no | Optional caller/client request id. |
| `payload.requestedAt` | yes | ISO timestamp when backend queued replacement. |

## Lambda replacement rules

Lambda handles `LOCKER_REPLACE` command and performs replacement.

Expected logic:

1. Read `bookingId`, `stationId`, and old `lockerBoxId` from payload.
2. Find the current booking.
3. Read old locker box data.
4. Determine old locker size.
5. Find another locker box:
    - same `stationId`;
    - same size as old locker;
    - technical status allows usage, for example `ACTIVE`;
    - user status is available, for example `AVAILABLE`;
    - not equal to old `lockerBoxId`.
6. Mark old locker as unavailable or faulty according to current Lambda/domain rules.
7. Reserve or assign the new locker.
8. Update booking to point to `newLockerBoxId`.
9. Write operation result.
10. Set operation status to `SUCCESS`.

If no replacement locker is available, Lambda sets operation status to `FAILED`.

## Lambda success result

When replacement succeeds, Lambda writes operation result similar to:

```json
{
  "operationId": "f7e6a0cb-ea07-44f5-9837-d33470833c04",
  "type": "LOCKER_REPLACE",
  "status": "SUCCESS",
  "bookingId": "13d96d5a-de94-4065-ac0b-9a4caf62a2a8",
  "lockerBoxId": "a8430e99-a087-48d5-9e56-dc399158f867",
  "result": {
    "oldLockerBoxId": "a8430e99-a087-48d5-9e56-dc399158f867",
    "newLockerBoxId": "d7ed01cc-e4c5-42e5-aa93-c8bd78a9a7ee",
    "newLockerCode": "A-102",
    "size": "M",
    "stationId": "fe57053f-4861-4277-bf3c-6a9bedbdb115",
    "bookingId": "13d96d5a-de94-4065-ac0b-9a4caf62a2a8",
    "failedOperationId": "6be0b5d3-73c1-4359-8241-81ebc62fa461",
    "failedOperationType": "LOCKER_OPEN",
    "reason": "OPEN_ATTEMPTS_EXHAUSTED",
    "nextAction": "OPEN_NEW_LOCKER",
    "message": "Locker replaced successfully"
  },
  "timestamp": "2026-05-24T12:00:02.000Z"
}
```

`newLockerCode` and `size` are recommended because they help clients/debugging understand what was assigned, but the required value for system state is `newLockerBoxId`.

## Lambda failure result

When no replacement locker is available or replacement cannot be completed, Lambda writes operation result similar to:

```json
{
  "operationId": "f7e6a0cb-ea07-44f5-9837-d33470833c04",
  "type": "LOCKER_REPLACE",
  "status": "FAILED",
  "bookingId": "13d96d5a-de94-4065-ac0b-9a4caf62a2a8",
  "lockerBoxId": "a8430e99-a087-48d5-9e56-dc399158f867",
  "result": {
    "oldLockerBoxId": "a8430e99-a087-48d5-9e56-dc399158f867",
    "stationId": "fe57053f-4861-4277-bf3c-6a9bedbdb115",
    "bookingId": "13d96d5a-de94-4065-ac0b-9a4caf62a2a8",
    "failedOperationId": "6be0b5d3-73c1-4359-8241-81ebc62fa461",
    "failedOperationType": "LOCKER_OPEN",
    "reason": "OPEN_ATTEMPTS_EXHAUSTED",
    "nextAction": "CONTACT_SUPPORT"
  },
  "errorCode": "NO_AVAILABLE_REPLACEMENT_LOCKER",
  "errorMessage": "No available locker with the same size on this station",
  "timestamp": "2026-05-24T12:00:02.000Z"
}
```

Possible error codes:

```text
NO_AVAILABLE_REPLACEMENT_LOCKER
BOOKING_NOT_FOUND
LOCKER_NOT_FOUND
LOCKER_REPLACE_FAILED
```

## Polling operation status

Caller can poll the existing operation endpoint:

```text
GET /api/v1/operations/:operationId
```

Success example:

```json
{
  "success": true,
  "status": "success",
  "correlationId": "optional-correlation-id",
  "data": {
    "operationId": "f7e6a0cb-ea07-44f5-9837-d33470833c04",
    "type": "LOCKER_REPLACE",
    "status": "SUCCESS",
    "bookingId": "13d96d5a-de94-4065-ac0b-9a4caf62a2a8",
    "lockerBoxId": "a8430e99-a087-48d5-9e56-dc399158f867",
    "oldLockerBoxId": "a8430e99-a087-48d5-9e56-dc399158f867",
    "newLockerBoxId": "d7ed01cc-e4c5-42e5-aa93-c8bd78a9a7ee",
    "newLockerCode": "A-102",
    "size": "M",
    "stationId": "fe57053f-4861-4277-bf3c-6a9bedbdb115",
    "nextAction": "OPEN_NEW_LOCKER",
    "message": "Locker replaced successfully"
  }
}
```

## Notes and open questions

The following points must be aligned with the Lambda implementer:

- final command type string: current backend uses `LOCKER_REPLACE`;
- whether Lambda requires `size` in payload or derives it from `lockerBoxId`;
- exact technical status for old locker after replacement failure, for example `FAULTY` or `MAINTENANCE`;
- whether failed `LOCKER_OPEN` / `LOCKER_CLOSE` should automatically enqueue `LOCKER_REPLACE`, or the new endpoint is called by another backend/internal component;
- idempotency rule to avoid multiple `LOCKER_REPLACE` operations for the same `failedOperationId`.
