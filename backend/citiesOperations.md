placeholder, will improve

🌚GET /api/v1/cities/

------------------
create city

🌚POST /api/v1/cities/

пример body:
{
"code": "RSH",
"name": "RoshHaNikra"
}

-------------------
soft delete city

🌚DELETE /api/v1/cities/:id

пример ссылки: {{baseUrl}}/api/v1/cities/c64f0c34-eb5d-4b26-8aad-30e43793a1a6

-------------------
edit city

🌚PATCH /api/v1/cities/:id

пример ссылки: {{baseUrl}}/api/v1/cities/c64f0c34-eb5d-4b26-8aad-30e43793a1a6
пример body:
{
"code": "HIF",
"name": "Haifa but better"
}