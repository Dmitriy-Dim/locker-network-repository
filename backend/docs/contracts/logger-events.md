# Logger Events

## Current stdout payload shape

Alertable backend events use this stdout payload structure:

```json
{
  "category": "SECURITY_ALERT",
  "schemaVersion": 1,
  "severity": "HIGH",
  "eventId": "8a6cba2d-e1e5-4f0d-a69e-8fe3d8f3faaa",
  "eventType": "AUTH_INVALID_TOKEN",
  "occurredAt": "2026-05-10T04:00:00.000Z",
  "source": "backend",
  "environment": "production",
  "actorId": "optional-user-id",
  "correlationId": "request-correlation-id",
  "ipAddress": "203.0.113.10",
  "userAgent": "Mozilla/5.0",
  "method": "GET",
  "path": "/api/v1/auth/me",
  "reason": "human-readable reason",
  "details": {
    "any": "extra context"
  }
}
```

## Severity defaults

| Severity | Event types |
| --- | --- |
| `CRITICAL` | `UNCAUGHT_EXCEPTION`, `UNHANDLED_REJECTION`, `SERVER_STARTUP_FAILED`, `PAYMENT_WEBHOOK_SIGNATURE_INVALID`, `PAYMENT_SESSION_MISMATCH`, `ADMIN_ROLE_CHANGE`, `ADMIN_ROLE_CHANGE_FAILED` |
| `HIGH` | `AUTH_FORBIDDEN`, `AUTH_INVALID_TOKEN`, `RATE_LIMIT_EXCEEDED`, `INTERNAL_SERVER_ERROR`, `AWS_CREDENTIALS_FAILED`, `SQS_SEND_FAILED`, `SECURITY_EVENT_PIPELINE_FAILED` |
| `MEDIUM` | `AUTH_MISSING_TOKEN`, `AUTH_INVALID_CREDENTIALS`, `AUTH_USER_NOT_REGISTERED`, `AUTH_REFRESH_FAILED`, `PAYMENT_WEBHOOK_INVALID_PAYLOAD`, `PAYMENT_BOOKING_NOT_FOUND`, `PAYMENT_BOOKING_EXPIRED`, `PAYMENT_ALREADY_PROCESSED` |
| `LOW` | Reserved for low-risk informational alert records |

## Event Types

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

#### `AUTH_USER_NOT_REGISTERED`

- Meaning: login email does not match a registered user, or an access token subject no longer exists in the users table
- Severity: `MEDIUM`
- Public response must stay generic (`Invalid credentials` or `Invalid token`) to avoid account enumeration.

Example payload:
```json
{
  "category": "SECURITY_ALERT",
  "schemaVersion": 1,
  "severity": "MEDIUM",
  "eventId": "0e96ce57-9526-4043-8516-0f5cf5e6c927",
  "eventType": "AUTH_USER_NOT_REGISTERED",
  "occurredAt": "2026-05-10T04:15:00.000Z",
  "source": "backend",
  "environment": "production",
  "correlationId": "corr-007",
  "ipAddress": "127.0.0.1",
  "userAgent": "Mozilla/5.0",
  "method": "POST",
  "path": "/api/v1/auth/login",
  "reason": "Login failed: user not found",
  "details": {
    "email": "missing@example.com"
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

#### `ADMIN_ROLE_CHANGE`

- Meaning: privileged user role was changed by an admin
- Severity: `CRITICAL`

#### `ADMIN_ROLE_CHANGE_FAILED`

- Meaning: privileged user role change was attempted but failed
- Severity: `CRITICAL`

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

#### `INTERNAL_SERVER_ERROR`

- Meaning: unhandled backend error returned as HTTP 500
- Severity: `HIGH`

#### `UNCAUGHT_EXCEPTION`

- Meaning: backend process crashed from an uncaught exception
- Severity: `CRITICAL`

#### `UNHANDLED_REJECTION`

- Meaning: backend process crashed from an unhandled promise rejection
- Severity: `CRITICAL`

#### `SERVER_STARTUP_FAILED`

- Meaning: backend failed during startup
- Severity: `CRITICAL`

#### `AWS_CREDENTIALS_FAILED`

- Meaning: backend cannot resolve AWS credentials required for DynamoDB/SQS
- Severity: `HIGH`

#### `SQS_SEND_FAILED`

- Meaning: backend failed to enqueue an SQS command or cache projection event
- Severity: `HIGH`

#### `SECURITY_EVENT_PIPELINE_FAILED`

- Meaning: backend emitted a local security alert but could not send its compatibility SQS security event
- Severity: `HIGH`

#### `PAYMENT_WEBHOOK_SIGNATURE_INVALID`

- Meaning: Stripe webhook signature is missing, invalid, malformed, or outside tolerance
- Severity: `CRITICAL`

#### `PAYMENT_WEBHOOK_INVALID_PAYLOAD`

- Meaning: Stripe webhook body cannot be parsed or does not include required fields
- Severity: `MEDIUM`

#### `PAYMENT_SESSION_MISMATCH`

- Meaning: Stripe payment session id does not match the staged booking
- Severity: `CRITICAL`

#### `PAYMENT_BOOKING_NOT_FOUND`

- Meaning: Stripe payment event references a booking that is not present in staged booking storage
- Severity: `MEDIUM`

#### `PAYMENT_BOOKING_EXPIRED`

- Meaning: Stripe payment event arrived after staged booking TTL
- Severity: `MEDIUM`

#### `PAYMENT_ALREADY_PROCESSED`

- Meaning: duplicate or already-paid Stripe event was received
- Severity: `MEDIUM` by default; may be emitted as `LOW` for idempotent duplicate cases

## Lambda expectations

- Lambda writes its own alertable failures as structured JSON to CloudWatch.
- Lambda should use the same `category = SECURITY_ALERT`, `severity`, `eventType`, `source`, and correlation fields when an event should be visible to admin alerting.
- Backend does not write security logs directly to DynamoDB.

## Current implementation note

Backend writes `SECURITY_ALERT` records to stdout/CloudWatch only. Security alerts are not duplicated into RDS or sent through the operations queue.
