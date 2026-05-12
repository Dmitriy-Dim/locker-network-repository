## Auth

### Response formats

Most auth endpoints return plain JSON directly, not the common `sendSuccess` / `sendError` envelope used by locker and station endpoints.

Successful login-like response:

```json
{
  "accessToken": "jwt-access-token"
}
```

Successful `GET /api/v1/auth/me` response:

```json
{
  "status": "success",
  "data": {}
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

Rate limit response:

```json
{
  "success": false,
  "correlationId": "optional-correlation-id",
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many login attempts. Try again later."
  }
}
```

Validation failures are returned with `error.code = "HTTP_ERROR"` because request validation wraps Zod errors into `HttpError(400, ...)`.

### Public endpoints

#### POST /api/v1/auth/signup

- Roles: all
- Rate limit: max `5` requests per hour
- Also sets `refreshToken` cookie

Request body:

```json
{
  "name": "Dmitrii",
  "email": "dmitrii@example.com",
  "password": "StrongPass123!",
  "phone": "+972501234567"
}
```

Example `200 OK` body:

```json
{
  "accessToken": "jwt-access-token"
}
```

Example `400 Bad Request` body:

```json
{
  "success": false,
  "correlationId": "44d38fb1-0fae-44cc-b0f1-2705287d1111",
  "error": {
    "code": "HTTP_ERROR",
    "message": "email already in use"
  }
}
```

Responses:

- `200 OK` - user registered, access token returned, refresh token cookie set
- `400 Bad Request` - invalid request body or unique constraint violation such as `email already in use` or `phone already in use`
- `429 Too Many Requests` - signup rate limit exceeded
- `500 Internal Server Error` - unexpected repository/service failure

#### POST /api/v1/auth/login

- Roles: all
- Rate limit: max `5` failed attempts per `15` minutes per `email + IP`
- Also sets `refreshToken` cookie

Request body:

```json
{
  "email": "dmitrii@example.com",
  "password": "StrongPass123!"
}
```

Example `200 OK` body:

```json
{
  "accessToken": "jwt-access-token"
}
```

Example `401 Unauthorized` body:

```json
{
  "success": false,
  "correlationId": "f8356131-d2c3-4720-90a1-609ff2c02222",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Invalid credentials"
  }
}
```

Responses:

- `200 OK` - user authenticated, access token returned, refresh token cookie set
- `400 Bad Request` - invalid body such as malformed email or missing password
- `401 Unauthorized` - invalid credentials
- `429 Too Many Requests` - login rate limit exceeded
- `500 Internal Server Error` - unexpected repository/service failure

#### POST /api/v1/auth/google

- Roles: all
- Uses same limiter as login
- Also sets `refreshToken` cookie

Request body:

```json
{
  "idToken": "google-id-token"
}
```

Example `200 OK` body:

```json
{
  "accessToken": "jwt-access-token"
}
```

Example `401 Unauthorized` body:

```json
{
  "success": false,
  "correlationId": "83bfe167-88b7-4115-a2ce-3ce4614c3333",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Invalid Google token"
  }
}
```

Responses:

- `200 OK` - Google user authenticated, access token returned, refresh token cookie set
- `400 Bad Request` - invalid body, empty `idToken`
- `401 Unauthorized` - invalid Google token or Google account email is not verified
- `429 Too Many Requests` - login rate limit exceeded
- `500 Internal Server Error` - `GOOGLE_CLIENT_ID` is not configured or unexpected service failure

#### POST /api/v1/auth/refresh

- Roles: all
- Requires `refreshToken` cookie
- Rate limit: max `100` failed attempts per hour
- Returns a new access token and rotates refresh session/cookie

Example `200 OK` body:

```json
{
  "accessToken": "jwt-access-token"
}
```

Example `401 Unauthorized` body:

```json
{
  "success": false,
  "correlationId": "38d56089-db90-4681-bb10-495b5fef4444",
  "error": {
    "code": "HTTP_ERROR",
    "message": "No refresh token"
  }
}
```

Responses:

- `200 OK` - refresh succeeded, new access token returned, refresh cookie updated
- `400 Bad Request` - refresh token cookie missing from validated request cookies
- `401 Unauthorized` - no refresh token, invalid refresh token, session not found, token reuse detected, token expired, invalid token, or token already used
- `429 Too Many Requests` - refresh rate limit exceeded
- `500 Internal Server Error` - unexpected repository/service failure

### Protected endpoints

#### POST /api/v1/auth/logout

- Roles: authenticated users
- Requires bearer access token
- Revokes current refresh session and clears cookies

Example `200 OK` body:

```json
{
  "message": "Logged out"
}
```

Example `401 Unauthorized` body:

```json
{
  "success": false,
  "correlationId": "a311ec91-f6be-4740-88e2-38de31a25555",
  "error": {
    "code": "HTTP_ERROR",
    "message": "You are not logged in"
  }
}
```

Responses:

- `200 OK` - logout succeeded, cookies cleared
- `401 Unauthorized` - missing bearer token, invalid token, or unauthorized user context
- `500 Internal Server Error` - unexpected repository/service failure

#### GET /api/v1/auth/me

- Roles: authenticated users
- Requires bearer access token

Example `200 OK` body:

```json
{
  "status": "success",
  "data": {
    "userId": "7f34eb73-8680-4814-b7d8-715db5ae6666",
    "email": "dmitrii@example.com",
    "phone": "+972501234567",
    "name": "Dmitrii",
    "role": "USER",
    "createdAt": "2026-04-15T09:00:00.000Z"
  }
}
```

Example `401 Unauthorized` body:

```json
{
  "success": false,
  "correlationId": "d7b62ff2-12ef-4b48-8cb4-b13de3d67777",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Invalid token"
  }
}
```

Responses:

- `200 OK` - current user returned
- `401 Unauthorized` - missing bearer token or invalid token
- `404 Not Found` - user not found
- `500 Internal Server Error` - unexpected repository/service failure
