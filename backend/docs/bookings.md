## Bookings

This file is kept only as a compatibility pointer.

The canonical booking contracts now live in [contracts/booking-flow-contracts.md](./contracts/booking-flow-contracts.md).

Why this file was reduced:

- the older `POST /api/v1/bookings` contract conflicted with the current async flow
- request and response examples were duplicated across multiple backend documents
- SQS, DynamoDB staging, and payment-confirmation details now have a single source of truth

Use these documents instead:

- end-to-end booking API and storage contracts: [contracts/booking-flow-contracts.md](./contracts/booking-flow-contracts.md)
- backend overview and local setup: [README.md](./README.md)

Current API convention reminder:

- booking endpoints use the shared success/error envelope from `backend/src/utils/response.ts`
- async booking mutations (`init`, `extend`, queued cancel/status updates) respond with `202 Accepted` when the operation is queued successfully
