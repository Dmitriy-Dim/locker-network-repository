# Backend Documentation

This folder contains API and contract documentation for the backend.

- [auth.md](./auth.md) - authentication and session flow.
- [citiesOperations.md](./citiesOperations.md) - city management endpoints.
- [lockers.md](./lockers.md) - locker box endpoints.
- [stations.md](./stations.md) - locker station endpoints.
- [pricing.md](./pricing.md) - pricing endpoints.
- [bookings.md](./bookings.md) - booking API overview.
- [openapi.json](./openapi.json) - Swagger/OpenAPI source used by Swagger UI.
- [backend-v1.3-integration-notes.md](./backend-v1.3-integration-notes.md) - current backend changes and frontend/Lambda migration notes.
- [contracts](./contracts/README.md) - SQS, DynamoDB, cache, booking, device, and logging contracts.

Maintenance rule: when a route changes in `src/routes`, update all three public API surfaces in the same change:

- the owning markdown file in this folder
- [openapi.json](./openapi.json), used by Swagger UI
- [../postman/locker-backend.postman_collection.json](../postman/locker-backend.postman_collection.json)
