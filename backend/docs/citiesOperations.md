# Cities operations

## Public endpoints 

GET /api/v1/cities/

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

### Create city

POST /api/v1/cities/

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