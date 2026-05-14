## Payments

### Response format

Successful response:

```json
{
  "success": true,
  "status": "success",
  "correlationId": "optional-correlation-id",
  "data": {}
}
```

Error response:

```json
{
  "success": false,
  "status": "error",
  "correlationId": "optional-correlation-id",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Error message"
  }
}
```


#### GET /api/v1/admin/payments

- Roles: admin
- Source: RDS
- Query params: `bookingId`, `userId`, `status`, `provider`, `providerPaymentId`, `from`, `to`, `limit`, `skip`

Example `200 OK` response:

```json
{
  "success": true,
  "status": "success",
  "correlationId": "ddd4f807-c8d2-4866-b03f-d7d49ef5becc",
  "data": [
    {
      "paymentId": "a7f817fa-76cb-495b-af01-7cce69555030",
      "bookingId": "b217e115-27d7-4d61-83c2-14bacaf1b9ee",
      "booking": {
        "userId": "11444153-5c73-4508-bc77-be638d7cc93b"
      },
      "status": "PAID",
      "provider": "stripe",
      "providerPaymentId": "pi_3TWueeGaoUSS09Qr1ttxuJkH",
      "amount": "7.5",
      "currency": "ILS",
      "createdAt": "2026-05-14T08:30:06.100Z",
      "updatedAt": "2026-05-14T08:30:06.100Z"
    },
    {
      "paymentId": "7d16a2be-df61-4651-b8ff-d936610c4e4b",
      "bookingId": "8d73acc0-d0f8-42f1-981d-12adc60132d8",
      "booking": {
        "userId": "11444153-5c73-4508-bc77-be638d7cc93b"
      },
      "status": "PAID",
      "provider": "stripe",
      "providerPaymentId": "pi_3TWdoSGaoUSS09Qr0GRsDdzD",
      "amount": "7",
      "currency": "ILS",
      "createdAt": "2026-05-13T14:31:05.766Z",
      "updatedAt": "2026-05-13T14:31:05.766Z"
    }
  ]
}
```

Responses:

- `200 OK` - payments list returned, including empty array
- `400 Bad Request` - invalid query params
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `500 Internal Server Error` - unexpected server failure


#### GET /api/v1/admin/payments/:id

- Roles: admin
- Source: RDS
- Payment info by paymentId

Example `200 OK` response:

```json
{
  "success": true,
  "status": "success",
  "correlationId": "df35dd84-673a-4ccd-97e8-19cb31434068",
  "data": {
    "paymentId": "3e6ef0c0-95fb-46d4-9860-deae74c91a4b",
    "bookingId": "478ebbcd-00d8-4e75-9a67-0b1212215067",
    "booking": {
      "userId": "11444153-5c73-4508-bc77-be638d7cc93b"
    },
    "status": "PAID",
    "provider": "stripe",
    "providerPaymentId": "pi_3TUW1nGaoUSS09Qr1iRZ9ZBM",
    "amount": "30",
    "currency": "ILS",
    "createdAt": "2026-05-07T17:48:05.801Z",
    "updatedAt": "2026-05-07T17:48:05.801Z"
  }
}
```

Example `404 Not Found` response:
```json
{
  "success": false,
  "status": "error",
  "correlationId": "c59b165b-061c-42f2-8db8-7efcdbbe65f2",
  "message": "Payment not found.",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Payment not found."
  }
}
```

Responses:

- `200 OK` - payment returned.
- `400 Bad Request` - invalid id params
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `404 Not Found` - payment not found
- `500 Internal Server Error` - unexpected server failure


#### GET /api/v1/bookings/:id/payments

- Roles: admin
- Source: RDS
- Payment info by bookingId

Example `200 OK` response:

```json
{
  "success": true,
  "status": "success",
  "correlationId": "56b694e6-7a59-4c30-9a10-269b3fd234ab",
  "data": {
    "payments": [
      {
        "paymentId": "3e6ef0c0-95fb-46d4-9860-deae74c91a4b",
        "bookingId": "478ebbcd-00d8-4e75-9a67-0b1212215067",
        "status": "PAID",
        "provider": "stripe",
        "providerPaymentId": "pi_3TUW1nGaoUSS09Qr1iRZ9ZBM",
        "amount": "30",
        "currency": "ILS",
        "paidAt": "2026-05-07T17:48:05.000Z",
        "createdAt": "2026-05-07T17:48:05.801Z",
        "updatedAt": "2026-05-07T17:48:05.801Z"
      }
    ]
  }
}
```

Example `401 Unauthorized` response:
```json
{
  "success": false,
  "status": "error",
  "correlationId": "01a8c67e-bdf5-42c5-9a6a-1567e4eb95c4",
  "message": "Invalid token",
  "error": {
    "code": "HTTP_ERROR",
    "message": "Invalid token"
  }
}
```

Responses:

- `200 OK` - payments from current booking returned.
- `400 Bad Request` - invalid id params
- `401 Unauthorized` - missing bearer token or invalid token
- `403 Forbidden` - authenticated user does not have role `ADMIN`
- `404 Not Found` - booking not found
- `500 Internal Server Error` - unexpected server failure