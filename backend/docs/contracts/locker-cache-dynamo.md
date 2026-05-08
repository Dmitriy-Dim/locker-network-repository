## Locker Cache In DynamoDB

### Что это за кэш

Кэш локеров в DynamoDB хранит по одной записи на каждый locker box.

Backend ожидает, что в таблице лежат items формата `LockerCacheDto`, где:

- partition key: `lockerBoxId`
- sort key: не используется
- одна строка = один локер
- поле `version` используется для защиты от устаревших обновлений

Сейчас backend работает с этим кэшем в двух ролях:

1. Reader: читает item из DynamoDB через `LockerCacheRepository`
2. Producer: отправляет `locker_cache` projection events в SQS, которые затем обрабатывает lambda consumer

Прямая запись в `LOCKER_CACHE_TABLE` из backend API больше не является основным runtime-path. Основной поток для записи:

`backend -> CACHE_PROJECTION_QUEUE_URL -> cacheProjectionHandler -> DynamoDB`

Lambda в этом потоке занимается только `locker_cache`. Station cache туда не входит и остается на стороне backend через Redis + RDS fallback.

### Имя таблицы

Backend использует env:

```env
DYNAMO_LOCKER_CACHE_TABLE_NAME=<table-name>
CACHE_PROJECTION_QUEUE_URL=<queue-url>
```

Lambda использует env:

```env
LOCKER_CACHE_TABLE=<table-name>
```

Если env не задан у lambda, по умолчанию используется:

```text
locker-locker-cache
```

## 1. Что backend ожидает видеть в таблице

### Формат item в DynamoDB

Это объект формата `LockerCacheDto`.

Пример item:

```json
{
  "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
  "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
  "code": "A007",
  "size": "L",
  "status": "AVAILABLE",
  "version": 3,
  "lastStatusChangedAt": "2026-04-15T10:30:00.000Z",
  "pricePerHour": "15.00",
  "station": {
    "address": "HaNamal 12",
    "latitude": 32.821,
    "longitude": 34.998,
    "status": "ACTIVE",
    "city": {
      "code": "HFA",
      "name": "Haifa"
    }
  }
}
```

### Поля item

- `lockerBoxId: string`
  основной ключ записи в DynamoDB
- `stationId: string`
  id станции, к которой относится локер
- `code: string`
  код локера внутри станции
- `size: "S" | "M" | "L"`
- `status: "AVAILABLE" | "RESERVED" | "OCCUPIED" | "EXPIRED" | null`
- `techStatus: "INACTIVE" | "ACTIVE" | "MAINTENANCE" | "FAULTY"`
- `version: number`
  версия runtime-state локера
- `lastStatusChangedAt: string`
  ISO timestamp
- `pricePerHour: string | null`
  цена хранится строкой, потому что приходит из `Prisma.Decimal`
- `station.address: string | null`
- `station.latitude: number`
- `station.longitude: number`
- `station.status: "READY" | "ACTIVE" | "INACTIVE" | "MAINTENANCE"`
- `station.city.code: string`
- `station.city.name: string`

### Что backend считает обязательным

При чтении backend кастует запись из DynamoDB прямо в `LockerCacheDto`, поэтому по факту ожидает, что в item присутствуют все поля выше.

Особенно важны:

- `lockerBoxId`
- `stationId`
- `status`
- `version`
- `lastStatusChangedAt`
- `station.status`
- `station.city.code`
- `station.city.name`

### Важное замечание по `pricePerHour`

В backend контракте `pricePerHour` имеет тип:

```ts
string | null
```

Текущий lambda-контракт для `locker_cache` должен быть совместим с этим значением. То есть `null` для `pricePerHour` является допустимым и для event payload, и для записи в таблицу.

Пример item с `pricePerHour = null`:

```json
{
  "lockerBoxId": "54bafc41-44c6-4d23-b499-bb6d4ab42222",
  "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
  "code": "B003",
  "size": "M",
  "status": null,
  "techStatus": "MAINTENANCE",
  "version": 8,
  "lastStatusChangedAt": "2026-04-15T12:10:00.000Z",
  "pricePerHour": null,
  "station": {
    "address": "HaNamal 12",
    "latitude": 32.821,
    "longitude": 34.998,
    "status": "MAINTENANCE",
    "city": {
      "code": "HFA",
      "name": "Haifa"
    }
  }
}
```

## 2. Что внешний updater должен отправлять в кэш

Есть два релевантных формата.

### Вариант A. Прямая запись updater -> DynamoDB

Когда внешний updater или вспомогательный скрипт пишет запись в DynamoDB напрямую, он должен класть `LockerCacheDto` целиком как item.

Пример payload прямой записи:

```json
{
  "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
  "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
  "code": "A007",
  "size": "L",
  "status": "RESERVED",
  "version": 4,
  "lastStatusChangedAt": "2026-04-15T11:45:00.000Z",
  "pricePerHour": "15.00",
  "station": {
    "address": "HaNamal 12",
    "latitude": 32.821,
    "longitude": 34.998,
    "status": "ACTIVE",
    "city": {
      "code": "HFA",
      "name": "Haifa"
    }
  }
}
```

Что происходит:

- updater делает `PutCommand`
- вся запись заменяется целиком
- versioning должен соблюдаться на стороне writer-а

### Вариант B. Event-driven flow через SQS + lambda

Это текущий основной runtime-flow backend-а.

Для event-driven потока используется сообщение формата `CacheProjectionEvent`.

Пример `UPSERT` event для locker cache:

```json
{
  "eventId": "5a6db2d9-4ea7-4a37-9fb8-97565c861111",
  "schemaVersion": 1,
  "correlationId": "3d05779f-c0be-4d03-8c8d-d14f62605555",
  "occurredAt": "2026-04-15T11:45:02.000Z",
  "actorId": "2dcecc8f-a78d-4a85-a203-8b04cf9b2222",
  "entityType": "locker_cache",
  "entityId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
  "eventType": "UPSERT",
  "projectionVersion": 4,
  "payload": {
    "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
    "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
    "code": "A007",
    "size": "L",
    "status": "RESERVED",
    "version": 4,
    "lastStatusChangedAt": "2026-04-15T11:45:00.000Z",
    "pricePerHour": "15.00",
    "station": {
      "address": "HaNamal 12",
      "latitude": 32.821,
      "longitude": 34.998,
      "status": "ACTIVE",
      "city": {
        "code": "HFA",
        "name": "Haifa"
      }
    }
  }
}
```

Lambda ожидает:

- `entityType = "locker_cache"`
- `eventType = "UPSERT"` или `"DELETE"`
- `entityId = lockerBoxId`
- `projectionVersion = payload.version`
- `payload` совместим с `LockerCachePayload`

После этого lambda пишет в таблицу:

```json
{
  "...payload": "all payload fields",
  "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111"
}
```

То есть итоговый item в таблице должен быть тем же самым locker projection object.

### Пример `DELETE` event

```json
{
  "eventId": "b2ec08c8-59bf-4b15-8603-c4d3f83d3333",
  "schemaVersion": 1,
  "correlationId": "2488e5b1-d05e-4583-baf0-aa9151028888",
  "occurredAt": "2026-04-15T12:05:00.000Z",
  "actorId": "2dcecc8f-a78d-4a85-a203-8b04cf9b2222",
  "entityType": "locker_cache",
  "entityId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
  "eventType": "DELETE",
  "projectionVersion": 4,
  "payload": {
    "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
    "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
    "code": "A007",
    "size": "L",
    "status": "RESERVED",
    "version": 4,
    "lastStatusChangedAt": "2026-04-15T11:45:00.000Z",
    "pricePerHour": "15.00",
    "station": {
      "address": "HaNamal 12",
      "latitude": 32.821,
      "longitude": 34.998,
      "status": "ACTIVE",
      "city": {
        "code": "HFA",
        "name": "Haifa"
      }
    }
  }
}
```

Для `DELETE` lambda использует только:

- `entityType`
- `eventType`
- `entityId`

`payload` в delete flow фактически не нужен для удаления записи.

## 3. Правила versioning

### Как backend формирует version

Для locker cache version берётся из runtime-state локера:

- либо из уже существующего item в DynamoDB
- либо из RDS поля `locker.version`

При `PATCH /oper/boxes/:id/tech-status` и runtime-изменениях через booking flow backend делает:

```text
next.version = currentProjection.version + 1
```

### Как lambda защищается от stale updates

При `UPSERT` lambda:

1. читает текущий item по `lockerBoxId`
2. сравнивает `existing.version` с incoming `projectionVersion`
3. если `existing.version >= incoming`, update пропускается

То есть lambda ожидает монотонно растущую `version`.

### Как lambda удаляет запись

Lambda удаляет проще:

```json
{
  "Key": {
    "lockerBoxId": "..."
  }
}
```

Без version condition.

## 4. Что backend делает с этими данными дальше

Backend читает locker cache из DynamoDB и использует его:

- для `GET /api/v1/lockers/boxes`
- для `GET /api/v1/lockers/boxes/:id`
- как runtime-state source при сборке station projection
- как источник текущего `status`, `version`, `lastStatusChangedAt`

Важно:

- для public locker reads backend теперь делает fallback на RDS projection, если DynamoDB недоступна или cache empty
- для locker create/status/delete backend enqueue-ит projection events в `CACHE_PROJECTION_QUEUE_URL`, а не пишет в locker cache напрямую
- для pricing create/update backend переотправляет затронутые locker projections с forced version, чтобы `pricePerHour` обновился в DynamoDB даже при неизменном runtime locker version

Особенность:

- `findByStationId(stationId)` сейчас не использует secondary index
- backend делает `Scan` всей таблицы и потом фильтрует по `stationId`

То есть для корректной работы достаточно иметь только PK `lockerBoxId`, но для производительности по `stationId` в будущем может понадобиться GSI.

## 5. Минимально допустимый корректный item

Если нужен минимальный practically valid объект, который backend ожидает увидеть в таблице, он выглядит так:

```json
{
  "lockerBoxId": "8d6d1d7e-27df-4d8d-9aaf-c6924d275111",
  "stationId": "0486833f-d187-4af2-9b73-e7d661ca6104",
  "code": "A007",
  "size": "L",
  "status": "AVAILABLE",
  "version": 1,
  "lastStatusChangedAt": "2026-04-15T10:30:00.000Z",
  "pricePerHour": "15.00",
  "station": {
    "address": "HaNamal 12",
    "latitude": 32.821,
    "longitude": 34.998,
    "status": "ACTIVE",
    "city": {
      "code": "HFA",
      "name": "Haifa"
    }
  }
}
```

## 6. Кратко

Backend ожидает в DynamoDB locker item такого вида:

```json
{
  "lockerBoxId": "...",
  "stationId": "...",
  "code": "...",
  "size": "S|M|L",
  "status": "AVAILABLE|RESERVED|OCCUPIED|EXPIRED|null",
  "techStatus": "INACTIVE|ACTIVE|MAINTENANCE|FAULTY",
  "version": 1,
  "lastStatusChangedAt": "ISO date",
  "pricePerHour": "15.00",
  "station": {
    "address": "...",
    "latitude": 0,
    "longitude": 0,
    "status": "READY|ACTIVE|INACTIVE|MAINTENANCE",
    "city": {
      "code": "...",
      "name": "..."
    }
  }
}
```

Если поток идёт через lambda, то backend/lambda event должен нести этот же projection внутри:

```json
{
  "entityType": "locker_cache",
  "entityId": "<lockerBoxId>",
  "eventType": "UPSERT",
  "projectionVersion": 1,
  "payload": {
    "...": "locker cache item"
  }
}
```
