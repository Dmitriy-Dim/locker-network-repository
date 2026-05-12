# Станции, ячейки и кэширование по ролям

Этот документ описывает актуальную схему station/locker cache.

## 1. Источники данных

- `PostgreSQL (RDS)` — источник истины и write model
- `Redis` — station cache для публичных и user-read endpoint'ов
- `DynamoDB` — locker cache и таблица async operations

## 2. Как устроен поток обновления

### Станции

```text
GET station
  -> Redis
  -> fallback to PostgreSQL projection on miss
  -> backend warms Redis
```

### Ячейки

```text
POST/PATCH/DELETE locker
  -> PostgreSQL
  -> build locker projection in backend
  -> backend writes DynamoDB locker cache directly
```

## 3. Поведение по ролям

### `guest`

- `GET /api/v1/lockers/stations`
- `GET /api/v1/lockers/boxes`

Источники:

- stations: сначала Redis, потом fallback в RDS projection
- lockers: только DynamoDB

### `user`

- все возможности `guest`
- `GET /api/v1/lockers/stations/:id`
- `GET /api/v1/lockers/boxes/:id`

Источники:

- stations: Redis -> fallback RDS
- lockers: DynamoDB

### `operator`

- читает admin-view напрямую из PostgreSQL
- пишет в PostgreSQL
- station CRUD не обновляет Redis напрямую
- locker CRUD отправляет locker cache projection в cache projection queue

### `admin`

- все возможности `operator`
- `POST /api/v1/lockers/admin/stations/:id/resync-cache`
- `POST /api/v1/lockers/admin/stations/:id/hard-resync-cache`
- `POST /api/v1/lockers/admin/boxes/:id/resync-cache`
- `POST /api/v1/lockers/admin/boxes/:id/hard-resync-cache`
- `POST /api/v1/lockers/admin/cache/reconcile`
- `POST /api/v1/lockers/admin/cache/hard-refresh`

`resync-cache` endpoints выполняют принудительное точечное обновление кэша:

- station resync пишет projection в Redis напрямую
- locker resync отправляет projection в cache projection queue для записи в DynamoDB

`hard-resync-cache` endpoints принудительно увеличивают version cache projection и переотправляют актуальную RDS projection.

`cache/reconcile` оставлен как административная точка для внепланового compare-and-fill reconcile/refresh кэша.
`cache/hard-refresh` переотправляет полный station/locker каталог из RDS source of truth.

Оба catalog endpoint'а работают как смешанный refresh:

- stations: сравнивает RDS и Redis, затем upsert/delete в Redis
- lockers: сравнивает RDS и DynamoDB, затем enqueue upsert/delete в cache projection queue

## 4. Что лежит в station cache

- `stationId`, `cityId`, `address`, `latitude`, `longitude`
- `status`
- `version`
- `availableLockers`
- `city`
- вложенный список `lockers`

Версия станции вычисляется как:

- `station.updatedAt.getTime() * 1000 + station.version`

Это позволяет инвалидировать station cache даже при изменениях только в составе ячеек.

## 5. Что лежит в locker cache

- `lockerBoxId`, `stationId`, `code`, `size`, `status`
- `version`
- `lastStatusChangedAt`
- `pricePerHour`
- вложенная информация о станции

Locker cache хранится в DynamoDB, а runtime-статусы ячеек меняются только там.

## 6. Fallback-поведение

Если Redis недоступен:

- station read endpoint'ы читают projection из PostgreSQL
- station reconcile переключается в режим full resync from RDS

Если DynamoDB недоступна:

- locker read endpoint'ы возвращают ошибку, потому что runtime-статусы доступны только в DynamoDB
- locker reconcile переключается в режим full resync from RDS projection

## 7. Итог

- station cache читается backend из Redis и догревается backend при read miss
- locker cache читается backend из DynamoDB
- locker CRUD обновляет locker cache через cache projection queue
- station status/delete отправляют связанные locker cache записи в cache projection queue
- admin resync/reconcile обновляют station cache напрямую и locker cache через cache projection queue
- PostgreSQL хранит station metadata и locker metadata без runtime-статусов
- DynamoDB является источником истины для locker statuses
