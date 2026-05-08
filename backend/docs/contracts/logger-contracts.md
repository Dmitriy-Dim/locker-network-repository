## Logger Contracts

### SQS: Backend -> Lambda

#### Queue

- Queue URL: `OPERATIONS_QUEUE_URL`
- Transport: `AWS SQS`
- Producer: `backend`
- Consumer: `lambda command handler`

### Current command shape

Backend currently sends security logs with the same queue envelope used for other async commands:

```json
{
  "operationId": "2ccf7a98-9272-4101-b6e0-9d93d0124d2f",
  "type": "SECURITY_EVENT",
  "payload": {
    "eventId": "f5f1d0ad-9a6c-4b7b-a433-6dc7b01fd4c4",
    "eventType": "AUTH_INVALID_TOKEN",
    "occurredAt": "2026-04-13T12:45:00.000Z",
    "actorId": "1f41bb7e-1ae6-4188-8f9e-13b694301234",
    "correlationId": "corr-5dcf6e9a-1968-4d4c-8854-7240c9fa1234",
    "ipAddress": "127.0.0.1",
    "userAgent": "Mozilla/5.0",
    "method": "GET",
    "path": "/api/v1/auth/me",
    "reason": "jwt expired",
    "details": {
      "requiredRoles": [
        "ADMIN"
      ]
    }
  }
}
```

### Required fields

- `operationId`: queue command id
- `type`: always `SECURITY_EVENT`
- `payload.eventId`
- `payload.eventType`
- `payload.occurredAt`
- `payload.correlationId`
- `payload.method`
- `payload.path`
- `payload.reason`

### Optional fields

- `payload.actorId`
- `payload.ipAddress`
- `payload.userAgent`
- `payload.details`

### Message attributes

SQS message attributes:

```json
{
  "type": {
    "DataType": "String",
    "StringValue": "SECURITY_EVENT"
  }
}
```

### Lambda behavior

- Validate that `type === SECURITY_EVENT`
- Parse `payload`
- Write structured log to CloudWatch
- Use `payload.eventType` for event classification
- Use `payload.correlationId` for tracing

### Current limitation

`SECURITY_EVENT` currently uses the operations queue envelope but does not create a full initial operation item in the operations DynamoDB table before enqueue.

### CloudWatch log example

```json
{
  "category": "SECURITY_LOG",
  "operationId": "2ccf7a98-9272-4101-b6e0-9d93d0124d2f",
  "eventId": "f5f1d0ad-9a6c-4b7b-a433-6dc7b01fd4c4",
  "eventType": "AUTH_INVALID_TOKEN",
  "correlationId": "corr-5dcf6e9a-1968-4d4c-8854-7240c9fa1234",
  "path": "/api/v1/auth/me",
  "method": "GET",
  "actorId": "1f41bb7e-1ae6-4188-8f9e-13b694301234",
  "reason": "jwt expired",
  "details": {
    "requiredRoles": [
      "ADMIN"
    ]
  },
  "occurredAt": "2026-04-13T12:45:00.000Z"
}
```
