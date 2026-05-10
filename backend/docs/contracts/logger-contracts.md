# Logger Contracts

## CloudWatch: Backend -> Security Alert Pipeline

Backend alertable events are written to stdout as structured JSON. In ECS these records go to the backend CloudWatch Logs group and can be selected by a subscription filter. Alerts are not persisted to RDS.

### Subscription filter

```text
{ $.category = "SECURITY_ALERT" }
```

### Current stdout shape

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
  "actorId": "1f41bb7e-1ae6-4188-8f9e-13b694301234",
  "correlationId": "corr-5dcf6e9a-1968-4d4c-8854-7240c9fa1234",
  "ipAddress": "203.0.113.10",
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
```

### Required fields

- `category`: always `SECURITY_ALERT`
- `schemaVersion`
- `severity`: `CRITICAL`, `HIGH`, `MEDIUM`, or `LOW`
- `eventId`
- `eventType`
- `occurredAt`
- `source`
- `environment`
- `reason`

### Optional fields

- `actorId`
- `correlationId`
- `ipAddress`
- `userAgent`
- `method`
- `path`
- `details`

### Redaction

Alert details must not include secrets, passwords, access tokens, refresh tokens, raw cookies, Authorization headers, or raw Stripe signatures.

## AuditLog vs Security Alerts Ownership

`AuditLog` and CloudWatch security alerts are separate signals and should not be treated as interchangeable logs.

### AuditLog

Use `AuditLog` for business and administrative actions that describe who changed or accessed application state.

Examples:

- Successful auth lifecycle events such as login, logout, register, and token refresh
- Locker, station, city, pricing, booking, operation, and device actions
- Admin role updates
- Admin reads of audit logs

`AuditLog` answers: who did what to which business entity, and when?

### Security Alerts

Use CloudWatch security alerts for threat, abuse, incident, and operational security signals.

Examples:

- Missing, invalid, expired, or reused tokens
- Invalid credentials and unregistered-user auth attempts
- Forbidden access attempts
- Rate limit violations
- Payment webhook anomalies
- Internal errors, process failures, AWS/SQS/security pipeline failures
- Privileged admin role changes

Security alerts answer: what security-relevant event needs investigation, alerting, aggregation, or escalation?

### Overlap rule

Some sensitive events intentionally appear in both models, but with different semantics. For example, an admin role change is:

- `AuditLog.USER_ROLE_UPDATE`: durable business audit of the role mutation
- `SECURITY_ALERT.ADMIN_ROLE_CHANGE`: critical privileged-action signal for CloudWatch/SNS monitoring

Do not duplicate every failed or suspicious request into `AuditLog` by default. Failed auth, forbidden access, rate limits, webhook signature failures, and infrastructure/security failures belong in CloudWatch security alerts unless they also changed business state or are explicitly required for compliance audit.

## CloudWatch: Backend Security Alert Read Model

Backend emits structured `SECURITY_ALERT` JSON logs to stdout. CloudWatch is the source of technical/security alerts for admin dashboard reads and operational investigation. Alerts are not duplicated into RDS.

Admin endpoints:

- `GET /api/v1/admin/security-alerts`
- `GET /api/v1/admin/security-alerts/cloudwatch` legacy alias

Supported filters:

- `from`
- `to`
- `limit`
- `severity`
- `eventType`
- `source`
- `actorId`
- `correlationId`

CloudWatch read-through requires `CLOUDWATCH_LOG_GROUP_NAMES`.
