# Cities operations

## Public endpoints 

GET /api/v1/cities/

Response example: 

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

### Soft delete city 

- DELETE /api/v1/cities/:id

URL example: 
{{baseUrl}}/api/v1/cities/c64f0c34-eb5d-4b26-8aad-30e43793a1a6

Response example:

### Edit city

- PATCH /api/v1/cities/:id

URL example: 
{{baseUrl}}/api/v1/cities/c64f0c34-eb5d-4b26-8aad-30e43793a1a6

Body example:
```json
{
"code": "HIF",
"name": "Haifa but better"
}
```
Response example: