## Logger Events

### Current payload shape

All security events currently use this payload structure:

```json
{
  "eventId": "uuid",
  "eventType": "AUTH_INVALID_TOKEN",
  "occurredAt": "2026-04-13T12:45:00.000Z",
  "actorId": "optional-user-id",
  "correlationId": "request-correlation-id",
  "ipAddress": "127.0.0.1",
  "userAgent": "Mozilla/5.0",
  "method": "GET",
  "path": "/api/v1/auth/me",
  "reason": "human-readable reason",
  "details": {
    "any": "extra context"
  }
}
```

### Event Types

#### `AUTH_MISSING_TOKEN`

- Meaning: access token or refresh token is missing

Example payload:
```json
{
  "eventId": "e9b7fdcc-a7ff-4470-bdd1-6d285df8d1b9",
  "eventType": "AUTH_MISSING_TOKEN",
  "occurredAt": "2026-04-13T12:45:00.000Z",
  "correlationId": "corr-001",
  "ipAddress": "127.0.0.1",
  "userAgent": "PostmanRuntime/7.43.0",
  "method": "POST",
  "path": "/api/v1/auth/refresh",
  "reason": "Missing refresh token cookie"
}
```

#### `AUTH_INVALID_TOKEN`

- Meaning: bearer token exists but verification failed

Example payload:
```json
{
  "eventId": "59c8a08f-b18e-4d4c-96aa-a30db6f4ec49",
  "eventType": "AUTH_INVALID_TOKEN",
  "occurredAt": "2026-04-13T12:45:00.000Z",
  "correlationId": "corr-002",
  "ipAddress": "127.0.0.1",
  "userAgent": "Mozilla/5.0",
  "method": "GET",
  "path": "/api/v1/auth/me",
  "reason": "jwt expired"
}
```

#### `AUTH_FORBIDDEN`

- Meaning: user is authenticated but role is not allowed

Example payload:
```json
{
  "eventId": "4e51f7d6-c405-4f2a-bad7-bc5146510f76",
  "eventType": "AUTH_FORBIDDEN",
  "occurredAt": "2026-04-13T12:45:00.000Z",
  "actorId": "a0b8fd91-9e9f-4ef0-bf17-cf74b869af3d",
  "correlationId": "corr-003",
  "ipAddress": "127.0.0.1",
  "userAgent": "Mozilla/5.0",
  "method": "PATCH",
  "path": "/api/v1/lockers/oper/stations/123/status",
  "reason": "Authenticated user does not have required role",
  "details": {
    "requiredRoles": [
      "OPERATOR",
      "ADMIN"
    ],
    "actualRole": "USER"
  }
}
```

#### `AUTH_INVALID_CREDENTIALS`

- Meaning: login failed because user does not exist or password is wrong

Example payload:
```json
{
  "eventId": "3acac01d-c850-4ec8-9779-b420ce864bee",
  "eventType": "AUTH_INVALID_CREDENTIALS",
  "occurredAt": "2026-04-13T12:45:00.000Z",
  "correlationId": "corr-004",
  "ipAddress": "127.0.0.1",
  "userAgent": "PostmanRuntime/7.43.0",
  "method": "POST",
  "path": "/api/v1/auth/login",
  "reason": "Login failed: wrong password",
  "details": {
    "email": "user@test.com"
  }
}
```

#### `AUTH_REFRESH_FAILED`

- Meaning: refresh token flow failed

Example payload:
```json
{
  "eventId": "18e9f1b2-f25b-47c6-a652-7fd17a104307",
  "eventType": "AUTH_REFRESH_FAILED",
  "occurredAt": "2026-04-13T12:45:00.000Z",
  "actorId": "a0b8fd91-9e9f-4ef0-bf17-cf74b869af3d",
  "correlationId": "corr-005",
  "ipAddress": "127.0.0.1",
  "userAgent": "PostmanRuntime/7.43.0",
  "method": "POST",
  "path": "/api/v1/auth/refresh",
  "reason": "Refresh failed: token reuse detected",
  "details": {
    "sessionId": "85db4b3d-0afc-4a37-80ba-4f7f4023c91b"
  }
}
```

#### `RATE_LIMIT_EXCEEDED`

- Meaning: request was rejected with `429 Too Many Requests`

Example payload:
```json
{
  "eventId": "5579d4c8-00fb-43d4-b53e-0c8368fb50d4",
  "eventType": "RATE_LIMIT_EXCEEDED",
  "occurredAt": "2026-04-13T12:45:00.000Z",
  "correlationId": "corr-006",
  "ipAddress": "127.0.0.1",
  "userAgent": "PostmanRuntime/7.43.0",
  "method": "POST",
  "path": "/api/v1/auth/login",
  "reason": "auth.login rate limit exceeded",
  "details": {
    "limiterName": "auth.login",
    "limit": 5,
    "current": 6,
    "remaining": 0
  }
}
```

### Lambda expectations

- Lambda reads one SQS message
- Validates `type === SECURITY_EVENT`
- Extracts `payload.eventType`
- Writes structured JSON to CloudWatch
- Backend does not write security logs directly to DynamoDB

### Current implementation note

Security events currently use the operations queue transport, but they are not initialized as full operation records in the operations DynamoDB table before lambda processing.
