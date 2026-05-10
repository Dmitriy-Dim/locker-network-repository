# Security Alert Flow

## Context

Backend and the alerting Lambda can run in different AWS accounts. In this setup, CloudWatch Logs should not subscribe directly to a cross-account Lambda. For cross-account delivery, use a CloudWatch Logs destination backed by Kinesis Data Streams or Firehose.

Recommended production flow for the simple per-account SNS model:

```text
Account A: Backend
  Backend structured JSON logs
  -> CloudWatch Logs log group
  -> CloudWatch Metric Filters / Alarms
  -> Account-local SNS topic
  -> email / Slack / PagerDuty

Account B: Lambda
  Lambda structured JSON logs
  -> CloudWatch Logs log group
  -> CloudWatch Metric Filters / Alarms
  -> Account-local SNS topic
  -> email / Slack / PagerDuty

Admin read path:
  Admin UI
  -> Backend Admin API
  -> CloudWatch Logs Insights over configured backend/lambda log groups
```

No direct CloudWatch-to-CloudWatch link is required between accounts. If backend and Lambda run in different accounts, create alarms near the source log group/metric and point each account-local alarm to its own SNS topic or to a central notification topic.

## Current Implementation

Security alerts now exist in the backend stdout log stream and can be selected by CloudWatch Logs subscription filters.

- Shared emitter: `backend/src/utils/securityAlert.ts`
- Admin CloudWatch Logs Insights API: `GET /api/v1/admin/security-alerts`
- Backward-compatible alias: `GET /api/v1/admin/security-alerts/cloudwatch`
- Auth/rate-limit producer: `backend/src/services/securityEventService.ts`
- Backend error producer: `backend/src/errorHandler/errorHandler.ts`
- Process lifecycle producer: `backend/src/app.ts`
- Payment webhook producer: `backend/src/services/PaymentService.ts`
- SQS failure producer: `backend/src/services/sqsService.ts`
- Main alert transport: backend stdout JSON -> CloudWatch Logs

Current backend alert event types:

- `AUTH_MISSING_TOKEN`
- `AUTH_INVALID_TOKEN`
- `AUTH_FORBIDDEN`
- `AUTH_INVALID_CREDENTIALS`
- `AUTH_USER_NOT_REGISTERED`
- `AUTH_REFRESH_FAILED`
- `ADMIN_ROLE_CHANGE`
- `ADMIN_ROLE_CHANGE_FAILED`
- `RATE_LIMIT_EXCEEDED`
- `INTERNAL_SERVER_ERROR`
- `UNCAUGHT_EXCEPTION`
- `UNHANDLED_REJECTION`
- `SERVER_STARTUP_FAILED`
- `AWS_CREDENTIALS_FAILED`
- `SQS_SEND_FAILED`
- `SECURITY_EVENT_PIPELINE_FAILED`
- `PAYMENT_WEBHOOK_SIGNATURE_INVALID`
- `PAYMENT_WEBHOOK_INVALID_PAYLOAD`
- `PAYMENT_SESSION_MISMATCH`
- `PAYMENT_BOOKING_NOT_FOUND`
- `PAYMENT_BOOKING_EXPIRED`
- `PAYMENT_ALREADY_PROCESSED`

Current limitation:

- Backend alert events are emitted, but AWS CloudWatch metric filters, alarms, SNS topics, and subscriptions are not configured by application code.
- Backend alert events are not duplicated into RDS. CloudWatch is the source for technical/security alert reads.
- Lambda code still writes regular `action` logs, not `SECURITY_ALERT` records.

## Relationship To AuditLog

Security alerts are not a replacement for `AuditLog`. Keep security alerts focused on threat, abuse, incident, and operational security signals. Keep `AuditLog` focused on business/admin actions and durable entity history.

Intentional overlap is allowed only for sensitive events that need both views. Example: a role change should be written as an audit event for entity history and as a security alert for privileged-action monitoring.

Suspicious events that do not mutate business state, such as invalid tokens, failed credentials, forbidden access, rate limits, invalid webhook signatures, and infrastructure failures, should stay in CloudWatch security alerts unless compliance requirements explicitly require an audit record too.

## Target Log Contract

Backend and Lambda services should write alertable events to stdout as structured JSON. CloudWatch Logs subscription filters can then select only alert records.

Subscription filter pattern:

```text
{ $.category = "SECURITY_ALERT" }
```

Base payload:

```json
{
  "category": "SECURITY_ALERT",
  "schemaVersion": 1,
  "severity": "HIGH",
  "eventId": "8a6cba2d-e1e5-4f0d-a69e-8fe3d8f3faaa",
  "eventType": "AUTH_REFRESH_REUSE_DETECTED",
  "occurredAt": "2026-05-08T12:00:00.000Z",
  "source": "backend",
  "environment": "production",
  "actorId": "user-123",
  "correlationId": "corr-abc",
  "ipAddress": "203.0.113.10",
  "userAgent": "Mozilla/5.0",
  "method": "POST",
  "path": "/api/v1/auth/refresh",
  "reason": "Refresh failed: token reuse detected",
  "details": {
    "sessionId": "session-123"
  }
}
```

Required fields:

- `category`: always `SECURITY_ALERT`
- `schemaVersion`
- `severity`: `CRITICAL`, `HIGH`, `MEDIUM`, or `LOW`
- `eventId`
- `eventType`
- `occurredAt`
- `source`: `backend`, `lambda`, `firehose`, `kinesis`, etc.
- `environment`
- `reason`

Recommended fields when available:

- `actorId`
- `correlationId`
- `ipAddress`
- `userAgent`
- `method`
- `path`
- `details`

Do not include secrets, access tokens, refresh tokens, raw Stripe signatures, passwords, or full request bodies.

## Events To Alert On

### Critical

Send an admin notification immediately.

| Event type | Reason |
| --- | --- |
| `AUTH_REFRESH_REUSE_DETECTED` | Strong signal of stolen or replayed refresh token |
| `PAYMENT_WEBHOOK_SIGNATURE_INVALID` | Possible spoofed payment webhook |
| `PAYMENT_SESSION_MISMATCH` | Payment does not match staged booking |
| `LOCKER_OPEN_FAILED` | Physical locker failed to open |
| `LOCKER_CLOSE_FAILED` | Physical locker failed to close |
| `LOCKER_DOOR_STATE_INVALID` | Device state is unsafe or unexpected |
| `ADMIN_ROLE_CHANGE` | Privileged user role was changed |
| `ADMIN_ROLE_CHANGE_FAILED` | Attempted privileged role change failed |
| `UNCAUGHT_EXCEPTION` | Process crashed from uncaught exception |
| `UNHANDLED_REJECTION` | Process crashed from unhandled rejection |
| `SERVER_STARTUP_FAILED` | Backend failed to start |
| `SECURITY_EVENT_PIPELINE_FAILED` | Security event could not be delivered |

### High

Send quickly, with deduplication if events repeat.

| Event type | Reason |
| --- | --- |
| `AUTH_FORBIDDEN` | Authenticated user accessed a forbidden route |
| `RATE_LIMIT_EXCEEDED` | Abuse or brute force signal |
| `AUTH_INVALID_TOKEN` | Invalid or expired bearer token |
| `GOOGLE_ID_TOKEN_INVALID` | Invalid Google auth token |
| `LOCKER_BATCH_OPEN_FAILED` | Operator/admin batch open failed |
| `LOCKER_BATCH_CLOSE_FAILED` | Operator/admin batch close failed |
| `CACHE_PROJECTION_FAILED` | Cache projection Lambda failed |
| `AWS_CREDENTIALS_FAILED` | Backend cannot resolve AWS credentials |
| `SQS_SEND_FAILED` | Backend failed to enqueue command |
| `DYNAMO_UPDATE_FAILED` | Lambda failed to update operation state |
| `REDIS_WRITE_FAILED` | Cache write failed |
| `INTERNAL_SERVER_ERROR` | Unhandled backend 5xx error |

### Medium

Usually aggregate by IP, route, actor, or event type before notifying.

| Event type | Reason |
| --- | --- |
| `AUTH_INVALID_CREDENTIALS` | Failed login |
| `AUTH_USER_NOT_REGISTERED` | Login email is not registered, or token subject no longer exists |
| `AUTH_MISSING_TOKEN` | Missing access or refresh token |
| `VALIDATION_ERROR_SENSITIVE_ENDPOINT` | Bad payload on auth/payment/admin endpoint |
| `PAYMENT_WEBHOOK_INVALID_PAYLOAD` | Stripe webhook payload cannot be safely processed |
| `PAYMENT_BOOKING_NOT_FOUND` | Paid booking was not found in staged booking storage |
| `PAYMENT_BOOKING_EXPIRED` | Stripe payment arrived after staged booking TTL |
| `BOOKING_INIT_FAILED` | Booking init failed |
| `BOOKING_CANCEL_FAILED` | Booking cancel failed |
| `PRICE_UPDATE_FAILED` | Admin price update failed |
| `STATION_STATUS_UPDATE_FAILED` | Admin station status update failed |
| `LOCKER_TECH_STATUS_UPDATE_FAILED` | Admin locker tech status update failed |

## Example Events

### Invalid Login

```json
{
  "category": "SECURITY_ALERT",
  "schemaVersion": 1,
  "severity": "MEDIUM",
  "eventId": "a469b90f-6794-4c84-a688-789d4d08971e",
  "eventType": "AUTH_INVALID_CREDENTIALS",
  "occurredAt": "2026-05-08T12:01:00.000Z",
  "source": "backend",
  "environment": "production",
  "actorId": "user-123",
  "ipAddress": "203.0.113.10",
  "method": "POST",
  "path": "/api/v1/auth/login",
  "reason": "Login failed: wrong password",
  "details": {
    "email": "user@example.com"
  }
}
```

### Refresh Token Reuse

```json
{
  "category": "SECURITY_ALERT",
  "schemaVersion": 1,
  "severity": "CRITICAL",
  "eventId": "83b6e073-7a2e-4e3c-8795-6838099db7a9",
  "eventType": "AUTH_REFRESH_REUSE_DETECTED",
  "occurredAt": "2026-05-08T12:02:00.000Z",
  "source": "backend",
  "environment": "production",
  "actorId": "user-123",
  "method": "POST",
  "path": "/api/v1/auth/refresh",
  "reason": "Refresh token reuse detected",
  "details": {
    "sessionId": "session-123",
    "actionTaken": "revoked_all_active_sessions"
  }
}
```

### Stripe Webhook Signature Error

```json
{
  "category": "SECURITY_ALERT",
  "schemaVersion": 1,
  "severity": "CRITICAL",
  "eventId": "a06c5d25-10fa-4dfc-ae66-585591c16f74",
  "eventType": "PAYMENT_WEBHOOK_SIGNATURE_INVALID",
  "occurredAt": "2026-05-08T12:03:00.000Z",
  "source": "backend",
  "environment": "production",
  "method": "POST",
  "path": "/api/v1/payments/webhook",
  "reason": "Stripe signature verification failed",
  "details": {
    "provider": "stripe"
  }
}
```

### Payment Session Mismatch

```json
{
  "category": "SECURITY_ALERT",
  "schemaVersion": 1,
  "severity": "CRITICAL",
  "eventId": "03338b03-3c37-408a-8153-48ebcfeac51b",
  "eventType": "PAYMENT_SESSION_MISMATCH",
  "occurredAt": "2026-05-08T12:04:00.000Z",
  "source": "backend",
  "environment": "production",
  "method": "POST",
  "path": "/api/v1/payments/webhook",
  "reason": "paymentSessionId does not match staged booking",
  "details": {
    "bookingId": "booking-123",
    "paymentFlow": "BOOKING_INIT",
    "expectedPaymentSessionId": "cs_expected",
    "receivedPaymentSessionId": "cs_received"
  }
}
```

### Locker Open Failed

```json
{
  "category": "SECURITY_ALERT",
  "schemaVersion": 1,
  "severity": "CRITICAL",
  "eventId": "02c4eabd-d7b9-40d3-88a4-36e2a1d9b06f",
  "eventType": "LOCKER_OPEN_FAILED",
  "occurredAt": "2026-05-08T12:05:00.000Z",
  "source": "lambda",
  "environment": "production",
  "actorId": "user-123",
  "correlationId": "corr-abc",
  "reason": "Locker failed to open after 3 attempts",
  "details": {
    "operationId": "op-123",
    "stationId": "station-1",
    "lockerBoxId": "box-9",
    "bookingId": "booking-123",
    "errorCode": "LOCK_OPEN_FAILED",
    "attemptCount": 3
  }
}
```

### Internal Server Error

```json
{
  "category": "SECURITY_ALERT",
  "schemaVersion": 1,
  "severity": "HIGH",
  "eventId": "21856557-d276-44f0-b38f-fe957c143a7b",
  "eventType": "INTERNAL_SERVER_ERROR",
  "occurredAt": "2026-05-08T12:06:00.000Z",
  "source": "backend",
  "environment": "production",
  "correlationId": "corr-abc",
  "method": "PATCH",
  "path": "/api/v1/lockers/admin/boxes/box-9/tech-status",
  "reason": "Unhandled backend error",
  "details": {
    "errorName": "PrismaClientKnownRequestError",
    "errorCode": "P2002"
  }
}
```

## Alert Lambda Behavior

The alert Lambda should:

1. Decode CloudWatch Logs records from Kinesis.
2. Parse each log line as JSON.
3. Keep only records where `category === "SECURITY_ALERT"`.
4. Validate required fields.
5. Deduplicate repeated alerts by key.
6. Route alerts by severity.

Suggested routing:

| Severity | Behavior |
| --- | --- |
| `CRITICAL` | Send immediately |
| `HIGH` | Send immediately with 5-15 minute dedupe window |
| `MEDIUM` | Aggregate and send summary |
| `LOW` | Store only, no immediate admin notification |

Suggested dedupe keys:

```text
eventType + actorId + ipAddress + path
eventType + details.operationId
eventType + details.stationId + details.lockerBoxId
```

## AWS Setup Summary

In the security account:

1. Create Kinesis Data Stream for security alerts.
2. Create CloudWatch Logs destination backed by the stream.
3. Add destination policy allowing the backend account to subscribe.
4. Attach Alert Lambda to the Kinesis stream.
5. Attach Firehose or another consumer if S3 archive is required.
6. Configure SNS/email/Slack/Telegram delivery from Alert Lambda.
7. Add DLQ for Alert Lambda.

In the backend account:

1. Ensure backend writes structured JSON to CloudWatch Logs.
2. Create a subscription filter on the backend log group.
3. Use the cross-account destination ARN from the security account.
4. Use a filter pattern that selects `SECURITY_ALERT` events only.
5. Set `CLOUDWATCH_LOG_GROUP_NAMES` for backend read-through queries.

Example subscription filter:

```bash
aws logs put-subscription-filter \
  --log-group-name /aws/backend/locker-api \
  --filter-name security-alerts-to-security-account \
  --filter-pattern '{ $.category = "SECURITY_ALERT" }' \
  --destination-arn arn:aws:logs:eu-west-1:SECURITY_ACCOUNT_ID:destination:locker-security-alerts
```

## Monitoring

Add CloudWatch alarms for:

- Alert Lambda errors
- Alert Lambda throttles
- Alert Lambda DLQ messages
- Kinesis iterator age
- Kinesis write throttles
- Firehose delivery failures
- S3 delivery errors
- CloudWatch Logs subscription delivery errors

## Code Changes To Add

Backend:

- Done: add `SECURITY_ALERT` stdout emitter with `category`, `schemaVersion`, `severity`, `source`, and `environment`.
- Done: stop persisting backend alerts to RDS `SecurityAlert`.
- Done: make `GET /api/v1/admin/security-alerts` read CloudWatch Logs Insights.
- Done: keep `GET /api/v1/admin/security-alerts/cloudwatch` as a compatibility alias.
- Done: emit auth/rate-limit alerts directly to CloudWatch stdout logs.
- Done: add `INTERNAL_SERVER_ERROR` alerting in `errorHandler`.
- Done: add startup/crash/AWS credentials alert logs in `app.ts`.
- Done: add payment webhook security alerts in `PaymentService`.
- Done: add `SQS_SEND_FAILED`.
- Remaining: add admin role change alerts.
- Remaining: add Redis write failure alerts where cache writes fail.
- Remaining: add tests for payment and SQS alert emission.
- AWS/IaC: configure CloudWatch metric filters, alarms, SNS topics, and subscriptions in the account where each source log group/metric exists.

Lambda:

- Write locker operation failures as `SECURITY_ALERT` JSON.
- Write cache projection failures as `SECURITY_ALERT` JSON.
- Write DynamoDB update failures as `SECURITY_ALERT` JSON.
- Keep normal command logs separate from alert logs.

Alert Lambda:

- Implement CloudWatch Logs decoding.
- Implement validation and dedupe.
- Implement severity routing.
- Persist alert delivery state if dedupe must survive cold starts.

## Notes

- Keep the current audit DB for user/admin action history.
- Use CloudWatch/Kinesis/Firehose for cross-account real-time alerting and archive.
- Avoid logging sensitive values. Store IDs and safe metadata only.
- Treat CloudWatch Logs subscriptions as at-least-once delivery. Alert Lambda must be idempotent.
