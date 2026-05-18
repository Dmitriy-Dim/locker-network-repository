## Users


#### GET /api/v1/admin/users

- Roles: admin
- Source: RDS
- Query params: `role`, `email`, `phone`, `name`, `includeDeleted`, `limit`, `skip`

Example `200 OK` response:

```json
[
    {
        "userId": "3fe02ea8-0a04-492e-b004-48353de5cfef",
        "name": "Postman User",
        "email": "postman.user@example.com",
        "phone": "+972501112233",
        "role": "USER",
        "createdAt": "2026-05-10T16:55:44.174Z",
        "updatedAt": "2026-05-10T16:55:44.174Z",
        "isDeleted": false
    },
    {
        "userId": "1237e868-ce6f-496e-b0f8-d4f013f9d86a",
        "name": "User",
        "email": "user@gmail.com",
        "phone": "+972585326999",
        "role": "USER",
        "createdAt": "2026-04-09T19:31:14.464Z",
        "updatedAt": "2026-04-28T10:42:47.169Z",
      "isDeleted": true
    },
    {
        "userId": "17242686-d064-4ea8-816a-183c1f867f1f",
        "name": "Operator",
        "email": "operator@gmail.com",
        "phone": null,
        "role": "OPERATOR",
        "createdAt": "2026-04-09T16:58:39.523Z",
        "updatedAt": "2026-04-09T16:58:39.523Z",
      "isDeleted": false
    },
    {
        "userId": "3291b113-acb7-44af-b63c-799723e629c3",
        "name": "Admin",
        "email": "admin@gmail.com",
        "phone": null,
        "role": "ADMIN",
        "createdAt": "2026-04-09T16:56:53.631Z",
        "updatedAt": "2026-04-28T10:42:43.849Z",
      "isDeleted": false
    }
]
```


- `200 OK` - users list returned, including empty array
- `400 Bad Request` - invalid query params
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `500 Internal Server Error` - unexpected server failure

#### GET /api/v1/admin/users/:id

- Roles: admin
- Source: RDS

Example `200 OK` response:

```json
{
  "success": true,
  "status": "success",
  "correlationId": "b05e8b21-4534-42f7-b531-203e689aa7a2",
  "data": {
    "userId": "3291b113-acb7-44af-b63c-799723e629c3",
    "name": "Admin",
    "phone": null,
    "email": "admin@gmail.com",
    "role": "ADMIN",
    "isDeleted": false
  }
}
```

Example `404 Not Found` response:
```json
{
    "success": false,
    "status": "error",
    "correlationId": "0dbeecab-f870-4011-b480-e2f5c5e560e2",
    "message": "User not found",
    "error": {
        "code": "HTTP_ERROR",
        "message": "User not found"
    }
}
```


- `200 OK` - user returned
- `400 Bad Request` - invalid id params
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `404 Not Found` - user not found
- `500 Internal Server Error` - unexpected server failure

#### DELETE /api/v1/admin/users/:id

- Roles: admin
- Soft delete user by id

Example `200 OK` response:

```json
{
  "success": true,
  "status": "success",
  "correlationId": "af02cd9c-0a00-4cb8-9364-06aabd8a69fb",
  "data": {
    "result": {
      "userId": "f06e072d-d50f-48f3-b166-3044f9d3ef73",
      "name": "Postman Op",
      "phone": null,
      "email": "postman.oper@example.com",
      "role": "OPERATOR",
      "isDeleted": true
    }
  }
}
```

Example `409 Conflict` response:
```json
{
  "success": false,
  "status": "error",
  "correlationId": "fb60c45e-24f8-4a76-b94b-7da0356b8aac",
  "message": "User already deleted",
  "error": {
    "code": "HTTP_ERROR",
    "message": "User already deleted"
  }
}
```

- `200 OK` - return deleted user info
- `400 Bad Request` - invalid id params
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `404 Not Found` - user not found
- `409 Conflict` - user already deleted
- `500 Internal Server Error` - unexpected server failure

#### PATCH /api/v1/admin/users/:id/restore

- Roles: admin
- Restore user by id

Example `200 OK` response:

```json
{
  "success": true,
  "status": "success",
  "correlationId": "f975b628-953d-4f90-a63a-baafd8c88b10",
  "data": {
    "result": {
      "userId": "f06e072d-d50f-48f3-b166-3044f9d3ef73",
      "name": "Postman Op",
      "phone": null,
      "email": "postman.oper@example.com",
      "role": "OPERATOR",
      "isDeleted": false
    }
  }
}
```

Example `404 Not Found` response:
```json
{
  "success": false,
  "status": "error",
  "correlationId": "0dbeecab-f870-4011-b480-e2f5c5e560e2",
  "message": "User not found",
  "error": {
    "code": "HTTP_ERROR",
    "message": "User not found"
  }
}
```


- `200 OK` - return restored user info
- `400 Bad Request` - invalid id params
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `404 Not Found` - user not found
- `409 Conflict` - user already active
- `500 Internal Server Error` - unexpected server failure

#### PATCH /api/v1/admin/users/:id

- Roles: admin
- Change user role
  
Request body:

```json
{
  "role": "OPERATOR"
}
```

Example `200 OK` response:

```json
{
  "id": "f06e072d-d50f-48f3-b166-3044f9d3ef73",
  "role": "OPERATOR"
}
```

Example `404 Not Found` response:
```json
{
  "success": false,
  "status": "error",
  "correlationId": "d3fff264-0145-4b9b-a421-0fef4dca70c8",
  "message": "User not found",
  "error": {
    "code": "HTTP_ERROR",
    "message": "User not found"
  }
}
```

- `200 OK` - return user id and new role
- `400 Bad Request` - invalid id params
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `404 Not Found` - user not found
- `500 Internal Server Error` - unexpected server failure