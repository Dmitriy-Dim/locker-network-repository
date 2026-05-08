## Cache

This document is intentionally short and serves as the cache overview.

Canonical cache details are split by concern:

- role matrix and request routing: [catalog-cache-and-roles.md](./catalog-cache-and-roles.md)
- DynamoDB locker projection contract: [locker-cache-dynamo.md](./locker-cache-dynamo.md)
- public and admin route payloads: [../lockers.md](../lockers.md), [../stations.md](../stations.md)

### Core model

- PostgreSQL is the source of truth.
- station cache lives in Redis under `REDIS_STATION_CACHE_PREFIX`
- locker cache lives in DynamoDB table `DYNAMO_LOCKER_CACHE_TABLE_NAME`
- operations state lives in DynamoDB table `DYNAMO_TABLE_NAME`

### Read path

- public station reads prefer Redis and can fall back to RDS projections
- public locker reads use the DynamoDB locker cache
- operator and admin read models come from RDS-backed backend projections

### Write path

- station create keeps Redis refresh deferred
- station status and delete can require dependent locker cache updates
- locker create, status change, and delete update locker cache projection flow
- pricing create/update refreshes affected station cache entries and enqueues affected locker cache projections
- `resync-cache`, `hard-resync-cache`, `cache/reconcile`, and `cache/hard-refresh` are manual recovery endpoints

### When to read other docs

- if the question is "which role reads from where?", use [catalog-cache-and-roles.md](./catalog-cache-and-roles.md)
- if the question is "what exact item shape is stored in DynamoDB?", use [locker-cache-dynamo.md](./locker-cache-dynamo.md)
- if the question is "what does a route return?", use [../lockers.md](../lockers.md) or [../stations.md](../stations.md)
