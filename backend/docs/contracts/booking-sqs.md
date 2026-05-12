## Booking SQS

This file is kept only as a transport pointer.

The canonical booking transport contract now lives in [booking-flow-contracts.md](./booking-flow-contracts.md).

Current guidance:

- booking commands are part of the async booking flow, not a standalone legacy contract
- message shape, operation lifecycle, and payment-confirmation flow must be updated in one place only
- non-booking security-event transport remains documented separately in [logger-contracts.md](./logger-contracts.md)

Use these documents instead:

- booking HTTP, SQS, DynamoDB, and webhook contracts: [booking-flow-contracts.md](./booking-flow-contracts.md)
- lambda execution details: [../lambda/README.md](../lambda/README.md)
