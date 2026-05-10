# Cities operations

## Public endpoints 

- GET /api/v1/cities/

Query params:

- `code`
- `name`
- `limit`
- `skip`

URL example:
```
{{baseUrl}}/api/v1/cities
```

Response example: 
```json
{
    "success": true,
    "status": "success",
    "correlationId": "734b4349-a7fe-42ac-b492-6c708b8818ae",
    "data": [
        {
            "cityId": "9c64ab11-2e79-4494-8f54-3c116e4bdc05",
            "code": "KRM",
            "name": "Karmiel"
        },
        {
            "cityId": "c38f0243-fee5-41f1-b556-4b4954a3ae0b",
            "code": "ARD",
            "name": "Arad"
        }
    ]
}
```


## Admin endpoints 

### Soft-deleted cities

- GET /api/v1/cities/sd
- Roles: admin
- Query params: `code`, `name`, `limit`, `skip`

### Create city

- POST /api/v1/cities/

URL example:
```
{{baseUrl}}/api/v1/cities
```

Body example:
```json
{
"code": "RSH",
"name": "RoshHaNikra"
}
```
Response example:
```json
{
    "success": true,
    "status": "success",
    "correlationId": "6d163005-1286-4e72-9fef-c0b895f9becc",
    "data": {
        "id": "1775812b-0f4b-4397-96b8-5769d2e3a5cb"
    },
    "meta": {
        "cityCacheStatus": "SYNCED"
    }
}
```

### Soft delete city 

- DELETE /api/v1/cities/:id

URL example: 
```
{{baseUrl}}/api/v1/cities/1775812b-0f4b-4397-96b8-5769d2e3a5cb
```

Response example:
```json
{
    "success": true,
    "status": "success",
    "correlationId": "d4d934e5-f7b0-46dc-a7b2-9410a0db63e1",
    "data": {
        "id": "1775812b-0f4b-4397-96b8-5769d2e3a5cb",
        "isActive": false
    },
    "meta": {
        "cityCacheStatus": "SYNCED"
    }
}
```

### Edit city

- PATCH /api/v1/cities/:id

URL example: 
```
{{baseUrl}}/api/v1/cities/59c431b9-f677-47a5-abf8-e11bf29976ec
```

Body example:
```json
{
"code": "HIF",
"name": "Haifa but better"
}
```
Response example:
```json
{
    "success": true,
    "status": "success",
    "correlationId": "74d7bc62-ae16-4d79-85be-815778147d84",
    "data": {
        "id": "59c431b9-f677-47a5-abf8-e11bf29976ec",
        "old": {
            "code": "HFA",
            "name": "Haifa"
        },
        "new": {
            "code": "HIF",
            "name": "Haifa but better"
        }
    },
    "meta": {
        "cityCacheStatus": "SYNCED"
    }
}
```

### View soft deleted cities

- GET /api/v1/cities/sd

URL example:
```
{{baseUrl}}/api/v1/cities/sd/
```

Response example:
```json
{
    "success": true,
    "status": "success",
    "correlationId": "46a0d36d-b5f3-4a55-97b6-5359b0dc270b",
    "data": [
        {
            "cityId": "1775812b-0f4b-4397-96b8-5769d2e3a5cb",
            "code": "TT1",
            "name": "TestCity",
            "isActive": false,
            "createdAt": "2026-05-09T20:30:35.621Z",
            "updatedAt": "2026-05-09T20:31:44.198Z"
        },
        {
            "cityId": "c64f0c34-eb5d-4b26-8aad-30e43793a1a6",
            "code": "RSH",
            "name": "RoshHaNikra",
            "isActive": false,
            "createdAt": "2026-04-30T01:26:31.977Z",
            "updatedAt": "2026-05-02T23:30:24.178Z"
        }
    ]
}
```

### Restore city from soft deleted list

- PATCH /api/v1/cities/sd/:id

URL example:
```
{{baseUrl}}/api/v1/cities/sd/c64f0c34-eb5d-4b26-8aad-30e43793a1a6
```

Response example:
```json
{
    "success": true,
    "status": "success",
    "correlationId": "0540d6ce-a437-478a-8a57-c36eb936f1f2",
    "data": {
        "id": "c64f0c34-eb5d-4b26-8aad-30e43793a1a6",
        "code": "RSH",
        "name": "RoshHaNikra",
        "isActive": true
    },
    "meta": {
        "cityCacheStatus": "SYNCED"
    }
}
```
