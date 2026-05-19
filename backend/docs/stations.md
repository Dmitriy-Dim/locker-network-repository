## Stations

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

#### GET /api/v1/lockers/stations

- Roles: all
- Primary source: Redis station cache
- Redis catalog is reconciled with RDS projections before response is returned
- Fallback source: RDS projections when Redis is unavailable or access is denied
- Query params: `cityId`, `city`, `lat`, `lng`, `radius`, `status`, `limit`, `skip`

Example `200 OK` body:

```json
{
  "success": true,
  "correlationId": "4e7ccb52-d029-4482-a626-fd7619de1111",
  "data": [
    {
      "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
      "cityId": "4c9538bd-9c83-47fb-8a84-7b5a0ae61111",
      "address": "HaNamal 12",
      "latitude": 32.821,
      "longitude": 34.998,
      "status": "ACTIVE",
      "version": 7,
      "distance": 315.42,
      "city": {
        "code": "HFA",
        "name": "Haifa"
      },
      "_count": {
        "lockers": 14
      }
    }
  ]
}
```

Responses:

- `200 OK` - station list returned, including empty array
- response may include stations loaded from RDS when Redis catalog is partial or stale; backend warms missing/stale entries back into Redis
- `400 Bad Request` - invalid query params:
  invalid `status`, invalid numeric coercion for `lat|lng|radius`, or only one of `lat/lng` was provided
- `500 Internal Server Error` - unexpected cache/repository/service failure

#### GET /api/v1/lockers/stations/:id

- Roles: user
- Primary source: Redis station cache
- Fallback source: RDS projections when Redis is unavailable or access is denied

Example `200 OK` body:

```json
{
  "success": true,
  "correlationId": "99cd4d3b-946a-4cc2-9098-07e9bd952222",
  "data": {
    "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
    "cityId": "4c9538bd-9c83-47fb-8a84-7b5a0ae61111",
    "address": "HaNamal 12",
    "latitude": 32.821,
    "longitude": 34.998,
    "status": "ACTIVE",
    "version": 7,
    "availableLockers": 14,
    "city": {
      "code": "HFA",
      "name": "Haifa"
    },
    "lockers": [
      {
        "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
        "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
        "code": "A007",
        "size": "L",
        "status": "AVAILABLE",
        "version": 3,
        "lastStatusChangedAt": "2026-04-15T10:30:00.000Z",
        "pricePerHour": "15.00"
      }
    ]
  }
}
```

Example `404 Not Found` body:

```json
{
  "success": false,
  "correlationId": "99cd4d3b-946a-4cc2-9098-07e9bd952222",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Station doesn't exist"
  }
}
```

Responses:

- `200 OK` - station returned
- `400 Bad Request` - `id` is not a UUID
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `USER`
- `404 Not Found` - station does not exist
- `500 Internal Server Error` - unexpected cache/repository/service failure

### Admin/operator endpoints

#### GET /api/v1/lockers/admin/stations

- Roles: operator, admin
- Source: RDS
- Query params: `cityId`, `city`, `status`, `limit`, `skip`

Example `200 OK` body:

```json
{
  "success": true,
  "correlationId": "8dc3c7ec-839e-4759-b272-b24fe9af3333",
  "data": [
    {
      "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
      "cityId": "4c9538bd-9c83-47fb-8a84-7b5a0ae61111",
      "address": "HaNamal 12",
      "latitude": 32.821,
      "longitude": 34.998,
      "status": "ACTIVE",
      "version": 7,
      "availableLockers": 14,
      "city": {
        "code": "HFA",
        "name": "Haifa"
      },
      "lockers": [
        {
          "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
          "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
          "code": "A007",
          "size": "L",
          "status": "AVAILABLE",
          "version": 3,
          "lastStatusChangedAt": "2026-04-15T10:30:00.000Z",
          "pricePerHour": "15.00"
        }
      ]
    }
  ]
}
```

Responses:

- `200 OK` - stations returned, including empty array
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `OPERATOR` or `ADMIN`
- `500 Internal Server Error` - unexpected repository/service failure

#### GET /api/v1/lockers/admin/stations/:id

- Roles: operator, admin
- Source: RDS

Example `200 OK` body:

```json
{
  "success": true,
  "correlationId": "827af0c8-d2d7-4021-aec4-5dcb225b4444",
  "data": {
    "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
    "cityId": "4c9538bd-9c83-47fb-8a84-7b5a0ae61111",
    "address": "HaNamal 12",
    "latitude": 32.821,
    "longitude": 34.998,
    "status": "ACTIVE",
    "version": 7,
    "availableLockers": 14,
    "city": {
      "code": "HFA",
      "name": "Haifa"
    },
    "lockers": [
      {
        "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
        "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
        "code": "A007",
        "size": "L",
        "status": "AVAILABLE",
        "version": 3,
        "lastStatusChangedAt": "2026-04-15T10:30:00.000Z",
        "pricePerHour": "15.00"
      }
    ]
  }
}
```

Responses:

- `200 OK` - station returned
- `400 Bad Request` - `id` is not a UUID
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `OPERATOR` or `ADMIN`
- `404 Not Found` - station does not exist
- `500 Internal Server Error` - unexpected repository/service failure

#### POST /api/v1/lockers/admin/stations

- Roles: operator, admin
- Writes station to RDS
- Backend does not write Redis station cache directly on create

Request body:

```json
{
  "city": "HFA",
  "latitude": 34.405045,
  "longitude": 37.706076,
  "address": "test"
}
```

Example `200 OK` body:

```json
{
  "success": true,
  "correlationId": "533e238b-b3a3-4514-96bb-8366381a5555",
  "data": {
    "id": "0486833f-d187-4af2-9b73-e7d661ca6104",
    "city": "HFA"
  },
  "meta": {
    "stationCacheStatus": "SYNCED"
  }
}
```

Example `404 Not Found` body:

```json
{
  "success": false,
  "correlationId": "533e238b-b3a3-4514-96bb-8366381a5555",
  "error": {
    "code": "HTTP_ERROR",
    "message": "City not found"
  }
}
```

Responses:

- `200 OK` - station created, response contains created station id and city code
- `400 Bad Request` - invalid body:
  `latitude` outside `[-90, 90]`, `longitude` outside `[-180, 180]`, or wrong field types
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `OPERATOR` or `ADMIN`
- `404 Not Found` - city not found
- `409 Conflict` - idempotency conflict when `Idempotency-Key` is reused incorrectly or request is still in progress
- `500 Internal Server Error` - projection build failed or unexpected repository/service failure

#### PATCH /api/v1/lockers/admin/stations/:id/status
#### PATCH /api/v1/lockers/oper/stations/:id/status

- Admin route roles: admin
- Operator route roles: operator
- Updates RDS first
- Backend does not write Redis station cache directly on status change
- Rewrites dependent locker projections directly in DynamoDB

Request body:

```json
{
  "status": "INACTIVE"
}
```

Example `200 OK` body:

```json
{
  "success": true,
  "correlationId": "80df99f2-c580-484b-a68a-5e50ea2f6666",
  "data": {
    "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
    "status": "INACTIVE"
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
  "correlationId": "80df99f2-c580-484b-a68a-5e50ea2f6666",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Station is already INACTIVE"
  }
}
```

Responses:

- `200 OK` - station status changed
- `400 Bad Request` - invalid UUID, invalid status, station already has requested status, or station is deleted
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `OPERATOR` or `ADMIN`
- `404 Not Found` - station not found
- `409 Conflict` - idempotency conflict when `Idempotency-Key` is reused incorrectly or request is still in progress
- `500 Internal Server Error` - projection build failed or unexpected repository/service failure

#### POST /api/v1/lockers/admin/stations/:id/resync-cache

- Roles: admin
- Rebuilds one station projection from RDS
- Writes station cache directly to Redis
- Enqueues dependent locker cache upserts to the cache projection queue

Example `202 Accepted` body:

```json
{
  "success": true,
  "correlationId": "58ec4dc6-27cf-4a52-ba88-e3cbf6f37777",
  "data": {
    "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104"
  },
  "meta": {
    "stationCacheStatus": "SYNCED"
  }
}
```

Responses:

- `202 Accepted` - station cache refreshed, response contains `stationId`
- `400 Bad Request` - `id` is not a UUID
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `404 Not Found` - station not found
- `500 Internal Server Error` - cache/projection/service failure

#### POST /api/v1/lockers/admin/stations/:id/hard-resync-cache

- Roles: admin
- Rebuilds one station projection from RDS
- Writes station cache directly to Redis
- Forces dependent locker cache projection versions above current cached versions
- Enqueues dependent locker cache upserts/deletes to the cache projection queue

Example `202 Accepted` body:

```json
{
  "success": true,
  "correlationId": "58ec4dc6-27cf-4a52-ba88-e3cbf6f37777",
  "data": {
    "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
    "lockers": {
      "queuedCount": 12,
      "deleteQueuedCount": 1
    }
  },
  "meta": {
    "stationCacheStatus": "SYNCED",
    "lockerCacheStatus": "DEFERRED"
  }
}
```

Responses:

- `202 Accepted` - station cache hard refresh queued/completed
- `400 Bad Request` - `id` is not a UUID
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `404 Not Found` - station not found
- `500 Internal Server Error` - cache/projection/service failure

#### POST /api/v1/lockers/admin/cache/reconcile

- Roles: admin
- Administrative endpoint reserved for unscheduled cache reconcile / refresh flow
- Compares RDS station projections with Redis station cache
- Compares RDS locker projections with DynamoDB locker cache
- Upserts and deletes station cache records directly in Redis
- Enqueues locker cache upserts/deletes to the cache projection queue
- Does not delete stations that are only `INACTIVE`

Example `202 Accepted` body:

```json
{
  "success": true,
  "correlationId": "57879d32-c68f-47d8-a7c9-73b843a08888",
  "data": {
    "mode": {
      "stations": "compare-and-fill",
      "lockers": "compare-and-fill"
    },
    "stations": {
      "sourceCount": 12,
      "queuedCount": 2,
      "deleteQueuedCount": 1
    },
    "lockers": {
      "sourceCount": 120,
      "queuedCount": 6,
      "deleteQueuedCount": 3
    }
  },
  "meta": {
    "stationCacheStatus": "SYNCED",
    "lockerCacheStatus": "SYNCED"
  }
}
```

Responses:

- `202 Accepted` - reconcile started/completed and cache state updated directly
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `500 Internal Server Error` - unexpected projection/cache/service failure

#### POST /api/v1/lockers/admin/cache/hard-refresh

- Roles: admin
- Rebuilds the full station and locker catalog from RDS source of truth
- Writes station cache records directly to Redis
- Forces locker cache projection versions above current cached versions
- Enqueues locker cache upserts/deletes to the cache projection queue

Example `202 Accepted` body:

```json
{
  "success": true,
  "correlationId": "57879d32-c68f-47d8-a7c9-73b843a08888",
  "data": {
    "mode": {
      "stations": "compare-and-fill",
      "lockers": "compare-and-fill"
    },
    "stations": {
      "sourceCount": 12,
      "queuedCount": 12,
      "deleteQueuedCount": 1
    },
    "lockers": {
      "sourceCount": 120,
      "queuedCount": 120,
      "deleteQueuedCount": 3
    }
  },
  "meta": {
    "stationCacheStatus": "SYNCED",
    "lockerCacheStatus": "SYNCED"
  }
}
```

Responses:

- `202 Accepted` - hard refresh started/completed and cache updates were applied or queued
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `500 Internal Server Error` - unexpected projection/cache/service failure

#### PATCH /api/v1/lockers/oper/stations/:id/delete

- Roles: operator
- Soft-deletes station in RDS
- Marks station status as `INACTIVE`
- Backend does not delete Redis station cache directly
- Deletes dependent locker cache records directly from DynamoDB

Example `200 OK` body:

```json
{
  "success": true,
  "correlationId": "dc794496-8658-430a-90a8-7fa648af9999",
  "data": {
    "message": "Station deleted",
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
  "correlationId": "dc794496-8658-430a-90a8-7fa648af9999",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Station is already deleted"
  }
}
```

Responses:

- `200 OK` - station soft-deleted
- `400 Bad Request` - `id` is not a UUID or station is already deleted
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `OPERATOR`
- `404 Not Found` - station not found
- `409 Conflict` - idempotency conflict when `Idempotency-Key` is reused incorrectly or request is still in progress
- `500 Internal Server Error` - delete projection failed or unexpected repository/service failure
