## Devices

### Response format

Successful response:

```json
{
  "success": true,
  "status": "success",
  "correlationId": "optional-correlation-id",
  "data": {}
}
```

Error response:

```json
{
  "success": false,
  "status": "error",
  "correlationId": "optional-correlation-id",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Error message"
  }
}
```

#### POST /api/v1/devices/open-locker
#### POST /api/v1/devices/close-locker

- Roles: user
- Send command to sqs LOCKER_OPEN/LOCKER_CLOSE

Request body:

```json
{
  "bookingId": "13d96d5a-de94-4065-ac0b-9a4caf62a2a8",
  "stationId": "fe57053f-4861-4277-bf3c-6a9bedbdb115",
  "lockerBoxId": "a8430e99-a087-48d5-9e56-dc399158f867"
}
```

Example `202 Accepted` response:
```json
{
    "success": true,
    "status": "success",
    "correlationId": "f2444cd2-2b9b-44a6-b2c0-a7f219a7a808",
    "data": {
        "operationId": "6be0b5d3-73c1-4359-8241-81ebc62fa461",
        "status": "PENDING",
        "type": "LOCKER_OPEN",
        "message": "Locker open command accepted"
    }
}
```

Example `409 Conflict` response:
```json
{
  "success": false,
  "status": "error",
  "correlationId": "22258e7d-d7ac-4be6-8465-95225ef4fa19",
  "message": "Booking has expired",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Booking has expired"
  }
}
```

Responses:

- `202 Accepted` - sqs command send, response contains created operation id
- `400 Bad Request` - invalid body
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `USER`
- `404 Not Found` - booking or locker not found
- `409 Conflict` - idempotency conflict when `Idempotency-Key` is reused incorrectly or request is still in progress.
 Locker or station does not match booking. Booking has expired or Booking is not active
- `500 Internal Server Error` - unexpected server failure

#### GET /api/v1/operations/:id

Example `200 OK` response:
```json
{
    "success": true,
    "status": "success",
    "correlationId": "6dad83ca-923b-4b3d-997c-2c15eb07df82",
    "data": {
        "operationId": "c174ceb9-4967-433f-b37b-c8df276e9547",
        "type": "LOCKER_CLOSE",
        "status": "SUCCESS",
        "timestamp": "2026-05-14T07:59:09.440Z",
        "bookingId": "4874d945-586f-44d0-a93d-b8a868feb3ff",
        "lockerBoxId": "c1f27e7b-6906-4384-ad6d-57673039b2af",
        "maxAttempts": 3,
        "attemptCount": 1,
        "nextAction": "NONE",
        "lockStatus": "LOCKED",
        "message": "Locker closed",
        "doorStatus": "CLOSED"
    }
}
```

#### POST /api/v1/devices/oper/open-locker
#### POST /api/v1/devices/oper/close-locker

- Roles: operator
- Send command to sqs LOCKER_OPEN_BATCH/LOCKER_CLOSE_BATCH

Request body:

```json
{
  "mode": "IDS",
  "lockerBoxIds": ["0b9dd4c4-221b-4cfb-9540-dea5b09dd472", "4e1f2a08-fab0-40ca-88e7-be479125df45"],
  "stationId": "4b39cb70-fe5c-4759-8ae7-73e889354a7d",
  "reason": "Some reason"
}
```

```json
{
  "mode": "STATUS",
  "status": "OCCUPIED",
  "stationId": "4b39cb70-fe5c-4759-8ae7-73e889354a7d",
  "reason": "Some reason"
}
```
- Possible status values:   
  AVAILABLE
  RESERVED
  OCCUPIED
  FAULTY
  EXPIRED


```json
{
  "mode": "ALL",
  "stationId": "4b39cb70-fe5c-4759-8ae7-73e889354a7d",
  "reason": "Some reason"
}
```

Example `202 Accepted` response:
```json
{
  "success": true,
  "status": "success",
  "correlationId": "4ece0157-7e9a-42c6-bb6b-57ce23b692ce",
  "data": {
    "operationId": "07f87833-02e6-4ae6-907c-6a7ae4359ddf",
    "status": "PENDING",
    "type": "LOCKER_OPEN_BATCH",
    "message": "Batch locker open operation created"
  }
}
```

Example `401 Unauthorized` response:
```json
{
  "success": false,
  "status": "error",
  "correlationId": "72f7c408-c782-4393-bdaf-f26a13249117",
  "message": "Invalid token",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Invalid token"
  }
}
```

Responses:

- `202 Accepted` - sqs command send, response contains created operation id
- `400 Bad Request` - invalid body
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `OPERATOR`
- `404 Not Found` - station not found
- `409 Conflict` - idempotency conflict when `Idempotency-Key` is reused incorrectly or request is still in progress. 
 No lockers match filter.
- `500 Internal Server Error` - unexpected server failure

#### GET /api/v1/operations/:id

Example `200 OK` response:
```json
{
  "success": true,
  "status": "success",
  "correlationId": "4689913f-eb7a-46eb-aa19-c1ba49b36407",
  "data": {
    "operationId": "07f87833-02e6-4ae6-907c-6a7ae4359ddf",
    "type": "LOCKER_OPEN_BATCH",
    "status": "SUCCESS",
    "timestamp": "2026-05-14T08:18:47.456Z",
    "mode": "IDS",
    "total": 2,
    "opened": [
      {
        "lockStatus": "UNLOCKED",
        "lockerBoxId": "0b9dd4c4-221b-4cfb-9540-dea5b09dd472",
        "doorStatus": "OPEN"
      },
      {
        "lockStatus": "UNLOCKED",
        "lockerBoxId": "4e1f2a08-fab0-40ca-88e7-be479125df45",
        "doorStatus": "OPEN"
      }
    ],
    "failed": [],
    "failedCount": 0,
    "openedCount": 2
  }
}
```