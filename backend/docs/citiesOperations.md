# Cities operations

------------

## Public endpoints 

GET /api/v1/cities/

## Admin endpoints 

### Create city

POST /api/v1/cities/

```json
{
"code": "RSH",
"name": "RoshHaNikra"
}
```

### Soft delete city 

- DELETE /api/v1/cities/:id

- Example: 
- {{baseUrl}}/api/v1/cities/c64f0c34-eb5d-4b26-8aad-30e43793a1a6

### Edit city

- PATCH /api/v1/cities/:id

- Example: 
- {{baseUrl}}/api/v1/cities/c64f0c34-eb5d-4b26-8aad-30e43793a1a6

```json
{
"code": "HIF",
"name": "Haifa but better"
}
```