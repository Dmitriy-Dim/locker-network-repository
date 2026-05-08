## Lockers

### Response format

Successful response:

```json
{
  "success": true,
  "correlationId": "optional-correlation-id",
  "data": {},
  "meta": {}
}
```

Error response:

```json
{
  "success": false,
  "correlationId": "optional-correlation-id",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Error message"
  }
}
```

Validation failures are also returned with `error.code = "HTTP_ERROR"` because request validation wraps Zod errors into `HttpError(400, ...)`.

### Public endpoints

#### GET /api/v1/lockers/boxes

- Roles: all
- Primary source: DynamoDB cache
- Fallback source: RDS projections when DynamoDB is unavailable or access is denied
- Query params: `stationId`, `size`, `status`

Example `200 OK` body:

```json
{
  "success": true,
  "correlationId": "9b4cb9b6-7a2f-4f8d-a0a8-0c72b3d9e111",
  "data": [
    {
      "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
      "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
      "code": "A007",
      "size": "L",
      "status": "AVAILABLE",
      "version": 3,
      "lastStatusChangedAt": "2026-04-15T10:30:00.000Z",
      "pricePerHour": "15.00",
      "station": {
        "address": "HaNamal 12",
        "city": "Haifa",
        "latitude": 32.821,
        "longitude": 34.998
      }
    }
  ]
}
```

Responses:

- `200 OK` - locker list returned, including empty array
- `400 Bad Request` - invalid query params:
  `stationId` is not a UUID, `size` is not one of `S|M|L`, or `status` is not one of `AVAILABLE|RESERVED|OCCUPIED|EXPIRED`
- `500 Internal Server Error` - unexpected cache/repository/service failure

#### GET /api/v1/lockers/boxes/:id

- Roles: user
- Primary source: DynamoDB cache
- Fallback source: RDS projections when DynamoDB is unavailable or access is denied

Example `200 OK` body:

```json
{
  "success": true,
  "correlationId": "b94b8d5c-f3e7-4dad-b341-8ca6c149b222",
  "data": {
    "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
    "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
    "code": "A007",
    "size": "L",
    "status": "AVAILABLE",
    "version": 3,
    "lastStatusChangedAt": "2026-04-15T10:30:00.000Z",
    "pricePerHour": "15.00",
    "station": {
      "address": "HaNamal 12",
      "city": "Haifa",
      "latitude": 32.821,
      "longitude": 34.998
    }
  }
}
```

Example `404 Not Found` body:

```json
{
  "success": false,
  "correlationId": "b94b8d5c-f3e7-4dad-b341-8ca6c149b222",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Locker doesn't exist"
  }
}
```

Responses:

- `200 OK` - locker returned
- `400 Bad Request` - `id` is not a UUID
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `USER`
- `404 Not Found` - locker does not exist
- `500 Internal Server Error` - unexpected cache/repository/service failure

### Admin/operator endpoints

#### GET /api/v1/lockers/admin/boxes

- Roles: operator, admin
- Source: RDS

Example `200 OK` body:

```json
{
  "success": true,
  "correlationId": "6f8f5eb2-8cc9-4e4d-a5cc-5218de5c3333",
  "data": [
    {
      "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
      "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
      "code": "A007",
      "size": "L",
      "status": "AVAILABLE",
      "version": 3,
      "lastStatusChangedAt": "2026-04-15T10:30:00.000Z",
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
  ]
}
```

Responses:

- `200 OK` - lockers returned, including empty array
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `OPERATOR` or `ADMIN`
- `500 Internal Server Error` - unexpected repository/service failure

#### GET /api/v1/lockers/admin/boxes/:id

- Roles: operator, admin
- Source: RDS

Example `200 OK` body:

```json
{
  "success": true,
  "correlationId": "06c560f9-5d94-498e-af0d-6e316f734444",
  "data": {
    "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
    "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
    "code": "A007",
    "size": "L",
    "status": "AVAILABLE",
    "version": 3,
    "lastStatusChangedAt": "2026-04-15T10:30:00.000Z",
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
}
```

Responses:

- `200 OK` - locker returned
- `400 Bad Request` - `id` is not a UUID
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `OPERATOR` or `ADMIN`
- `404 Not Found` - locker does not exist
- `500 Internal Server Error` - unexpected repository/service failure

#### POST /api/v1/lockers/admin/boxes

- Roles: operator, admin
- Writes locker to RDS
- Enqueues locker cache upsert to the cache projection queue
- Backend sets `techStatus = "INACTIVE"` and `status = null`; frontend sends only `stationId`, `code`, and `size`

Request body:

```json
{
  "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
  "code": "A007",
  "size": "L"
}
```

Example `200 OK` body:

```json
{
  "success": true,
  "correlationId": "3d05779f-c0be-4d03-8c8d-d14f62605555",
  "data": {
    "id": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
    "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104"
  },
  "meta": {
    "stationCacheStatus": "SYNCED",
    "lockerCacheStatus": "DEFERRED"
  }
}
```

Example `409 Conflict` body:

```json
{
  "success": false,
  "correlationId": "3d05779f-c0be-4d03-8c8d-d14f62605555",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Idempotent request is already in progress"
  }
}
```

Responses:

- `200 OK` - locker created, response contains created locker id and station id
- `400 Bad Request` - invalid body, locker with the same `stationId + code` already exists
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `OPERATOR` or `ADMIN`
- `404 Not Found` - station not found
- `409 Conflict` - idempotency conflict when `Idempotency-Key` is reused incorrectly or request is still in progress
- `500 Internal Server Error` - projection build failed or unexpected repository/service failure

#### PATCH /api/v1/lockers/oper/boxes/:id/tech-status

- Roles: operator
- Updates locker technical lifecycle state in RDS
- Keeps `techStatus` field name in the request and response
- Enqueues updated locker projection to the cache projection queue after the RDS update
- If `techStatus !== "ACTIVE"`, backend sets `status = null`
- If `techStatus === "ACTIVE"` and `status == null`, backend sets `status = "AVAILABLE"`
- The old admin/operator `PATCH /api/v1/lockers/admin/boxes/:id/status` route is no longer published; user runtime status changes are driven by booking flows
- The old `READY` locker technical status is removed and must not be sent by clients

Request body:

```json
{
  "techStatus": "ACTIVE"
}
```

Allowed values:

```text
ACTIVE | INACTIVE | MAINTENANCE | FAULTY
```

Example `200 OK` body:

```json
{
  "success": true,
  "correlationId": "cf0a4d6d-4dda-455c-b23d-f5ee7c666666",
  "data": {
    "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
    "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
    "code": "A007",
    "size": "L",
    "status": "AVAILABLE",
    "techStatus": "ACTIVE"
  },
  "meta": {
    "stationCacheStatus": "SYNCED",
    "lockerCacheStatus": "DEFERRED"
  }
}
```

Example `400 Bad Request` body:

```json
{
  "success": false,
  "correlationId": "cf0a4d6d-4dda-455c-b23d-f5ee7c666666",
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "Cannot change from INACTIVE to ACTIVE"
  }
}
```

Responses:

- `200 OK` - locker technical status changed
- `400 Bad Request` - invalid UUID, invalid technical status, invalid transition, same status, or locker is deleted
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `OPERATOR` or `ADMIN`
- `404 Not Found` - locker does not exist
- `409 Conflict` - idempotency conflict when `Idempotency-Key` is reused incorrectly or request is still in progress
- `500 Internal Server Error` - projection build failed or unexpected repository/service failure

#### POST /api/v1/lockers/admin/boxes/:id/resync-cache

- Roles: admin
- Rebuilds one locker projection from backend state
- Enqueues locker cache upsert to the cache projection queue

Example `202 Accepted` body:

```json
{
  "success": true,
  "correlationId": "57ae3fa7-f2ff-4f4c-9bdd-420a2fd57777",
  "data": {
    "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111"
  },
  "meta": {
    "lockerCacheStatus": "DEFERRED"
  }
}
```

Responses:

- `202 Accepted` - locker cache refreshed, response contains `lockerBoxId`
- `400 Bad Request` - `id` is not a UUID
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `404 Not Found` - locker not found
- `500 Internal Server Error` - cache/projection/service failure

#### POST /api/v1/lockers/admin/boxes/:id/hard-resync-cache

- Roles: admin
- Rebuilds one locker projection from backend state
- Forces a cache projection version greater than the current cached version
- Enqueues locker cache upsert to the cache projection queue

Example `202 Accepted` body:

```json
{
  "success": true,
  "correlationId": "57ae3fa7-f2ff-4f4c-9bdd-420a2fd57777",
  "data": {
    "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
    "queuedVersion": 14
  },
  "meta": {
    "lockerCacheStatus": "DEFERRED"
  }
}
```

Responses:

- `202 Accepted` - locker cache hard refresh queued
- `400 Bad Request` - `id` is not a UUID
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `404 Not Found` - locker not found
- `500 Internal Server Error` - cache/projection/service failure

#### PATCH /api/v1/lockers/oper/boxes/:id/delete

- Roles: operator
- Soft-deletes in RDS
- Enqueues locker cache delete to the cache projection queue

Example `200 OK` body:

```json
{
  "success": true,
  "correlationId": "2488e5b1-d05e-4583-baf0-aa9151028888",
  "data": {
    "message": "Locker deleted",
    "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
    "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104"
  },
  "meta": {
    "stationCacheStatus": "SYNCED",
    "lockerCacheStatus": "DEFERRED"
  }
}
```

Example `400 Bad Request` body:

```json
{
  "success": false,
  "correlationId": "2488e5b1-d05e-4583-baf0-aa9151028888",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Locker already deleted"
  }
}
```

Responses:

- `200 OK` - locker soft-deleted
- `400 Bad Request` - `id` is not a UUID or locker is already deleted
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `OPERATOR`
- `404 Not Found` - locker does not exist
- `409 Conflict` - idempotency conflict when `Idempotency-Key` is reused incorrectly or request is still in progress
- `500 Internal Server Error` - delete projection failed or unexpected repository/service failure
