## Pricing

#### GET /api/v1/pricing

- Roles: admin
- Source: RDS

Example `200 OK` body:

```json
[
  {
    "priceId": "4be791a9-d7f5-43a7-847b-ff2ff5b9fcc2",
    "cityId": "8044cefd-6992-4fd2-945a-aa20079d53a5",
    "size": "S",
    "pricePerHour": "6",
    "createdAt": "2026-04-29T10:00:02.118Z",
    "updatedAt": "2026-04-29T10:00:02.118Z",
    "city": {
      "code": "HFA",
      "name": "Haifa"
    }
  },
  {
    "priceId": "02ed2c87-d775-454d-82fe-7a5498acd7aa",
    "cityId": "8044cefd-6992-4fd2-945a-aa20079d53a5",
    "size": "L",
    "pricePerHour": "16",
    "createdAt": "2026-04-29T10:00:09.966Z",
    "updatedAt": "2026-04-29T10:00:09.966Z",
    "city": {
      "code": "HFA",
      "name": "Haifa"
    }
  },
  {
    "priceId": "e00d876c-7f5d-4b2d-826a-c409836a3eed",
    "cityId": "8044cefd-6992-4fd2-945a-aa20079d53a5",
    "size": "M",
    "pricePerHour": "10",
    "createdAt": "2026-04-29T09:59:51.484Z",
    "updatedAt": "2026-04-29T10:01:05.629Z",
    "city": {
      "code": "HFA",
      "name": "Haifa"
    }
  }
]
```

```json
{
    "success": false,
    "status": "error",
    "correlationId": "1016a5f5-5c05-453a-ad38-65520d9d07df",
    "message": "Invalid token",
    "error": {
        "code": "HTTP_ERROR",
        "message": "Invalid token"
    }
}
```

Responses:

- `200 OK` - lockers returned, including empty array
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `OPERATOR` or `ADMIN`
- `500 Internal Server Error` - unexpected repository/service failure


#### POST /api/v1/pricing

- Roles: admin
- Writes price to RDS
- Enqueues updated locker projection to the cache projection queue after the RDS update

Request body:

```json
{
  "cityId": "82685436-64ab-4d04-84cd-5e3f8a617598",
  "pricePerHour": 8.5,
  "size": "L"
}
```

Example `200 OK` body:

```json
{
  "success": true,
  "status": "success",
  "correlationId": "c188154f-61fc-4488-bc39-926ec9cf2e4c",
  "data": {
    "id": "3ee51c2f-aee8-4ff0-a27f-840efe5c1b6c"
  },
  "meta": {
    "stationCacheStatus": "SYNCED",
    "lockerCacheStatus": "SYNCED",
    "affectedStations": 0,
    "affectedLockers": 0
  }
}
```

Example `409 Conflict` body:

```json
{
  "success": false,
  "correlationId": "c188154f-61fc-4488-bc39-926ec9cf2e4c",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Idempotent request is already in progress"
  }
}
```

Example `404 Not Found` body:

```json
{
  "success": false,
  "status": "error",
  "correlationId": "0858495c-d9a9-4f82-98d9-5266ee196b77",
  "message": "City not found",
  "error": {
    "code": "HTTP_ERROR",
    "message": "City not found"
  }
}
```

Responses:

- `200 OK` - price created, response contains created price id
- `400 Bad Request` - invalid body, price with the same `cityId + size` already exists
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `404 Not Found` - city not found
- `409 Conflict` - idempotency conflict when `Idempotency-Key` is reused incorrectly or request is still in progress
- `500 Internal Server Error` - projection build failed or unexpected repository/service failure


#### PATCH /api/v1/pricing/:id

- Roles: admin
- Change price in RDS
- Enqueues updated locker projection to the cache projection queue after the RDS update

Request body:

```json
{
  "pricePerHour": 10
}
```

Example `200 OK` body:

```json
{
  "success": true,
  "status": "success",
  "correlationId": "e1f0c768-06ed-45d7-8689-dabad21317c3",
  "data": {
    "newPrice": {
      "priceId": "e00d876c-7f5d-4b2d-826a-c409836a3eed",
      "cityId": "8044cefd-6992-4fd2-945a-aa20079d53a5",
      "size": "M",
      "pricePerHour": "10"
    }
  },
  "meta": {
    "stationCacheStatus": "SYNCED",
    "lockerCacheStatus": "DEFERRED",
    "affectedStations": 1,
    "affectedLockers": 1
  }
}
```

Example `404 Not Found` body:

```json
{
  "success": false,
  "status": "error",
  "correlationId": "542376ea-5f82-4621-8453-b8fed9dac040",
  "message": "Price not found",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Price not found"
  }
}
```

Responses:

- `200 OK` - price updated, response contains newPrice
- `400 Bad Request` - invalid body
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `404 Not Found` - price not found
- `409 Conflict` - idempotency conflict when `Idempotency-Key` is reused incorrectly or request is still in progress
- `500 Internal Server Error` - projection build failed or unexpected repository/service failure