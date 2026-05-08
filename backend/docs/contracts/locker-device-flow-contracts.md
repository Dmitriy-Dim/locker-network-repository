# Контракты открытия и закрытия ячейки

Документ фиксирует целевой flow для пользовательского открытия и закрытия ячейки:

```text
frontend -> backend -> SQS -> lambda -> device simulator -> operation state -> frontend polling
```

Пока физического устройства нет, внутри lambda работает симуляция device. Симулятор рандомно определяет, сработал ли замок и изменилась ли дверца. Фронтенд не меняет состояние ячейки локально как источник истины: он создает операцию и узнает фактический результат через polling операции.

## 1. Общий принцип

Для каждого действия создается отдельная operation:

- открыть ячейку: `LOCKER_OPEN`
- закрыть ячейку: `LOCKER_CLOSE`
- открыть несколько ячеек оператором: `LOCKER_OPEN_BATCH`

Backend всегда:

- принимает запрос от frontend;
- проверяет booking и права пользователя;
- создает operation со статусом `PENDING`;
- отправляет SQS command в том же формате, что и остальные операции проекта;
- возвращает `operationId` фронтенду.

Lambda всегда:

- получает SQS command;
- переводит operation в `PROCESSING`;
- выполняет device simulation;
- сохраняет фактическое состояние замка и дверцы внутри locker record в DynamoDB;
- записывает результат в operation;
- переводит operation в `SUCCESS` или `FAILED`.

Frontend всегда:

- нажатием кнопки создает operation;
- поллит `GET /api/v1/operations/:operationId`;
- показывает состояние замка и дверцы из результата операции;
- после успешного открытия показывает кнопку закрытия;
- если lambda исчерпала три внутренние попытки и вернула `nextAction = CHANGE_LOCKER`, предлагает пользователю сменить ячейку.

## 2. Состояния

### Operation status

Используется существующий набор статусов:

```text
PENDING | PROCESSING | SUCCESS | FAILED
```

### Operation type

Нужно расширить enum `OperationType`:

```text
LOCKER_OPEN
LOCKER_CLOSE
LOCKER_OPEN_BATCH
```

### Физическое состояние

Состояние замка:

```text
LOCKED | UNLOCKED
```

Состояние дверцы:

```text
OPEN | CLOSED
```

### Runtime state в DynamoDB

Lambda должна хранить актуальное физическое состояние ячейки внутри locker record в DynamoDB. Это состояние является backend source of truth для замка и дверцы между операциями.

Минимальные поля внутри locker:

```json
{
  "lockerBoxId": "locker_55",
  "lockStatus": "LOCKED",
  "doorStatus": "CLOSED"
}
```

Правила обновления:

- после `LOCKER_OPEN` lambda записывает фактические `lockStatus` и `doorStatus` в locker record независимо от успеха или ошибки operation;
- после `LOCKER_CLOSE` lambda записывает фактические `doorStatus` и `lockStatus` в locker record независимо от успеха или ошибки operation;
- после `LOCKER_OPEN_BATCH` lambda обновляет locker record для каждой ячейки из batch отдельно;
- operation result должен содержать те же `lockStatus` и `doorStatus`, которые lambda сохранила в locker record;
- frontend не должен считать локальное состояние кнопок источником истины, если оно расходится с operation result или locker state из backend.

Правила проверки перед device simulation:

- перед `LOCKER_OPEN` lambda читает locker record из DynamoDB и проверяет, что `lockStatus = LOCKED` и `doorStatus = CLOSED`;
- если перед `LOCKER_OPEN` замок уже `UNLOCKED` или дверца уже `OPEN`, lambda не запускает симуляцию открытия и завершает operation по правилам неконсистентного или уже открытого состояния;
- перед `LOCKER_CLOSE` lambda читает locker record из DynamoDB и проверяет, что `lockStatus = UNLOCKED` и `doorStatus = OPEN`;
- если перед `LOCKER_CLOSE` дверца уже `CLOSED` и замок уже `LOCKED`, lambda может вернуть idempotent success без повторной симуляции;
- если перед `LOCKER_CLOSE` состояние смешанное, например `doorStatus = CLOSED`, `lockStatus = UNLOCKED`, lambda должна пытаться закрыть только замок или вернуть ошибку `LOCKER_STATE_INVALID`, в зависимости от поддерживаемого device adapter;
- перед `LOCKER_OPEN_BATCH` lambda проверяет текущее состояние каждой ячейки отдельно; неподходящие ячейки попадают в `result.failed`, остальные продолжают симуляцию.

### Внутренние попытки lambda

Для `LOCKER_OPEN` и `LOCKER_CLOSE` frontend создает одну operation. Lambda внутри обработки этой operation сама выполняет до трех попыток device simulation.

Попытка считается неудачной, если после одного шага simulation фактическое состояние не соответствует ожидаемому результату.

Ожидаемый результат открытия:

```text
lockStatus = UNLOCKED
doorStatus = OPEN
```

Ожидаемый результат закрытия:

```text
doorStatus = CLOSED
lockStatus = LOCKED
```

Если за три внутренние попытки lambda не получила ожидаемый результат, operation завершается `FAILED`, а в result возвращается:

```text
attemptCount = 3
maxAttempts = 3
nextAction = CHANGE_LOCKER
```

Frontend не должен сам запускать три отдельные операции для одного нажатия. Повторное нажатие пользователем после `CHANGE_LOCKER` не является штатным retry и должно быть заменено flow смены ячейки.

## 3. Открытие ячейки

### 3.1 HTTP request

Фронтенд показывает кнопку "Открыть ячейку" для активного booking. При нажатии он отправляет backend данные booking.

Рекомендуемый endpoint:

```text
POST /api/v1/bookings/:bookingId/open-locker
```

Роль:

```text
USER
```

Headers:

```http
Idempotency-Key: bk_001:user_123:req_001
```

Request body:

```json
{
  "bookingId": "bk_001",
  "lockerBoxId": "locker_55",
  "stationId": "station_123"
}
```

Если `bookingId` уже есть в path, в body его можно не дублировать. Backend не должен доверять `lockerBoxId` и `stationId` из body как источнику истины: он использует их только как expected values и сверяет с актуальным booking.

### 3.2 Backend validation

Backend проверяет:

- пользователь аутентифицирован;
- booking существует;
- booking принадлежит пользователю;
- booking имеет статус `ACTIVE`;
- booking не истек по `expectedEndTime`;
- locker из request совпадает с locker текущего booking;
- station из request совпадает со station текущего booking;
- locker не находится в техническом состоянии, запрещающем доступ;
- нет активной незавершенной operation открытия/закрытия для этого booking, если такая защита включена.

Если проверка не проходит, backend возвращает ошибку синхронно и не отправляет SQS command.

### 3.3 Backend response

После успешной проверки backend создает operation `LOCKER_OPEN`, отправляет command в SQS и возвращает `202 Accepted`.

```json
{
  "success": true,
  "status": "success",
  "data": {
    "operationId": "op_open_001",
    "type": "LOCKER_OPEN",
    "status": "PENDING",
    "bookingId": "bk_001",
    "lockerBoxId": "locker_55",
    "message": "Locker open operation created"
  }
}
```

### 3.4 SQS command

Формат должен совпадать с остальными operation commands: `operationId`, `type`, `payload`.

```json
{
  "operationId": "op_open_001",
  "type": "LOCKER_OPEN",
  "payload": {
    "userId": "user_123",
    "bookingId": "bk_001",
    "lockerBoxId": "locker_55",
    "stationId": "station_123",
    "requestedAt": "2026-04-29T10:00:00.000Z"
  }
}
```

### 3.5 Lambda simulation

Lambda получает `LOCKER_OPEN` и выполняет симуляцию device:

1. переводит operation в `PROCESSING`;
2. повторно проверяет booking и locker;
3. читает текущие `lockStatus` и `doorStatus` из locker record в DynamoDB;
4. проверяет, что ячейка находится в состоянии `LOCKED + CLOSED`;
5. если состояние не подходит для открытия, завершает operation с `FAILED` или idempotent result согласно правилам проверки;
6. запускает внутренний цикл до `maxAttempts = 3`;
7. на каждой попытке рандомно определяет, открылся ли замок;
8. если замок открылся, рандомно определяет, открылась ли дверца;
9. после каждой попытки сохраняет фактические `lockStatus` и `doorStatus` внутри locker record в DynamoDB;
10. если получено `UNLOCKED + OPEN`, завершает operation с `SUCCESS`;
11. если после трех попыток ожидаемое состояние не достигнуто, завершает operation с `FAILED`, `attemptCount = 3`, `maxAttempts = 3`, `nextAction = CHANGE_LOCKER`.

Успешный результат:

```json
{
  "operationId": "op_open_001",
  "type": "LOCKER_OPEN",
  "status": "SUCCESS",
  "bookingId": "bk_001",
  "lockerBoxId": "locker_55",
  "result": {
    "lockStatus": "UNLOCKED",
    "doorStatus": "OPEN",
    "attemptCount": 1,
    "maxAttempts": 3,
    "nextAction": "CLOSE_LOCKER",
    "message": "Locker opened"
  },
  "timestamp": "2026-04-29T10:00:02.000Z"
}
```

Ошибка открытия замка:

```json
{
  "operationId": "op_open_001",
  "type": "LOCKER_OPEN",
  "status": "FAILED",
  "bookingId": "bk_001",
  "lockerBoxId": "locker_55",
  "result": {
    "lockStatus": "LOCKED",
    "doorStatus": "CLOSED",
    "attemptCount": 3,
    "maxAttempts": 3,
    "nextAction": "CHANGE_LOCKER"
  },
  "errorCode": "OPEN_ATTEMPTS_EXHAUSTED",
  "errorMessage": "Locker failed to open after 3 attempts",
  "timestamp": "2026-04-29T10:00:02.000Z"
}
```

Ошибка открытия дверцы после успешного unlock:

```json
{
  "operationId": "op_open_001",
  "type": "LOCKER_OPEN",
  "status": "FAILED",
  "bookingId": "bk_001",
  "lockerBoxId": "locker_55",
  "result": {
    "lockStatus": "UNLOCKED",
    "doorStatus": "CLOSED",
    "attemptCount": 3,
    "maxAttempts": 3,
    "nextAction": "CHANGE_LOCKER"
  },
  "errorCode": "OPEN_ATTEMPTS_EXHAUSTED",
  "errorMessage": "Locker failed to open after 3 attempts",
  "timestamp": "2026-04-29T10:00:02.000Z"
}
```

## 4. Polling открытия

Frontend поллит:

```text
GET /api/v1/operations/:operationId
```

Ответ во время обработки:

```json
{
  "success": true,
  "status": "success",
  "data": {
    "operationId": "op_open_001",
    "type": "LOCKER_OPEN",
    "status": "PROCESSING",
    "bookingId": "bk_001",
    "lockerBoxId": "locker_55",
    "timestamp": "2026-04-29T10:00:01.000Z"
  }
}
```

Ответ после успешного открытия:

```json
{
  "success": true,
  "status": "success",
  "data": {
    "operationId": "op_open_001",
    "type": "LOCKER_OPEN",
    "status": "SUCCESS",
    "bookingId": "bk_001",
    "lockerBoxId": "locker_55",
    "result": {
      "lockStatus": "UNLOCKED",
      "doorStatus": "OPEN",
      "attemptCount": 1,
      "maxAttempts": 3,
      "nextAction": "CLOSE_LOCKER"
    }
  }
}
```

Если `lockStatus = UNLOCKED` и `doorStatus = OPEN`, frontend показывает кнопку "Закрыть".

## 5. Закрытие ячейки

### 5.1 HTTP request

Кнопка "Закрыть" доступна только после успешного открытия, когда frontend получил:

```text
lockStatus = UNLOCKED
doorStatus = OPEN
```

Рекомендуемый endpoint:

```text
POST /api/v1/bookings/:bookingId/close-locker
```

Headers:

```http
Idempotency-Key: bk_001:user_123:req_002
```

Request body:

```json
{
  "bookingId": "bk_001",
  "lockerBoxId": "locker_55",
  "stationId": "station_123"
}
```

### 5.2 Backend validation

Backend проверяет:

- пользователь аутентифицирован;
- booking существует и принадлежит пользователю;
- booking все еще активен или находится в состоянии, где закрытие ячейки разрешено;
- locker из request совпадает с locker текущего booking;
- предыдущая operation открытия принадлежит этому booking, если `previousOperationId` передан;
- нет активной незавершенной operation для этого booking.

### 5.3 Backend response

```json
{
  "success": true,
  "status": "success",
  "data": {
    "operationId": "op_close_001",
    "type": "LOCKER_CLOSE",
    "status": "PENDING",
    "bookingId": "bk_001",
    "lockerBoxId": "locker_55",
    "message": "Locker close operation created"
  }
}
```

### 5.4 SQS command

```json
{
  "operationId": "op_close_001",
  "type": "LOCKER_CLOSE",
  "payload": {
    "userId": "user_123",
    "bookingId": "bk_001",
    "lockerBoxId": "locker_55",
    "stationId": "station_123",
    "requestedAt": "2026-04-29T10:03:00.000Z"
  }
}
```

### 5.5 Lambda simulation

Lambda получает `LOCKER_CLOSE` и выполняет симуляцию закрытия:

1. переводит operation в `PROCESSING`;
2. повторно проверяет booking и locker;
3. читает текущие `lockStatus` и `doorStatus` из locker record в DynamoDB;
4. проверяет, что ячейка находится в состоянии `UNLOCKED + OPEN`;
5. если ячейка уже `LOCKED + CLOSED`, завершает operation как idempotent success;
6. если состояние не подходит для закрытия, завершает operation с `FAILED`;
7. запускает внутренний цикл до `maxAttempts = 3`;
8. на каждой попытке рандомно определяет, закрылась ли дверца;
9. если дверца закрылась, рандомно определяет, защелкнулся ли замок;
10. после каждой попытки сохраняет фактические `doorStatus` и `lockStatus` внутри locker record в DynamoDB;
11. если получено `CLOSED + LOCKED`, завершает operation с `SUCCESS`;
12. если после трех попыток ожидаемое состояние не достигнуто, завершает operation с `FAILED`, `attemptCount = 3`, `maxAttempts = 3`, `nextAction = CHANGE_LOCKER`.

Успешный результат:

```json
{
  "operationId": "op_close_001",
  "type": "LOCKER_CLOSE",
  "status": "SUCCESS",
  "bookingId": "bk_001",
  "lockerBoxId": "locker_55",
  "result": {
    "doorStatus": "CLOSED",
    "lockStatus": "LOCKED",
    "attemptCount": 1,
    "maxAttempts": 3,
    "nextAction": "NONE",
    "message": "Locker closed"
  },
  "timestamp": "2026-04-29T10:03:02.000Z"
}
```

Ошибка закрытия дверцы:

```json
{
  "operationId": "op_close_001",
  "type": "LOCKER_CLOSE",
  "status": "FAILED",
  "bookingId": "bk_001",
  "lockerBoxId": "locker_55",
  "result": {
    "doorStatus": "OPEN",
    "lockStatus": "UNLOCKED",
    "attemptCount": 3,
    "maxAttempts": 3,
    "nextAction": "CHANGE_LOCKER"
  },
  "errorCode": "CLOSE_ATTEMPTS_EXHAUSTED",
  "errorMessage": "Locker failed to close after 3 attempts",
  "timestamp": "2026-04-29T10:03:02.000Z"
}
```

Ошибка закрытия замка после закрытой дверцы:

```json
{
  "operationId": "op_close_001",
  "type": "LOCKER_CLOSE",
  "status": "FAILED",
  "bookingId": "bk_001",
  "lockerBoxId": "locker_55",
  "result": {
    "doorStatus": "CLOSED",
    "lockStatus": "UNLOCKED",
    "attemptCount": 3,
    "maxAttempts": 3,
    "nextAction": "CHANGE_LOCKER"
  },
  "errorCode": "CLOSE_ATTEMPTS_EXHAUSTED",
  "errorMessage": "Locker failed to close after 3 attempts",
  "timestamp": "2026-04-29T10:03:02.000Z"
}
```

## 6. Polling закрытия

Frontend поллит `GET /api/v1/operations/:operationId`.

Ответ после успешного закрытия:

```json
{
  "success": true,
  "status": "success",
  "data": {
    "operationId": "op_close_001",
    "type": "LOCKER_CLOSE",
    "status": "SUCCESS",
    "bookingId": "bk_001",
    "lockerBoxId": "locker_55",
    "result": {
      "doorStatus": "CLOSED",
      "lockStatus": "LOCKED",
      "attemptCount": 1,
      "maxAttempts": 3,
      "nextAction": "NONE"
    }
  }
}
```

Если `doorStatus = CLOSED` и `lockStatus = LOCKED`, frontend считает ячейку закрытой.

## 7. Открытие ячеек оператором

Оператор может создать batch-operation на открытие ячеек станции. Поддерживаются три режима выбора целей:

- все ячейки станции;
- только ячейки с определенным статусом;
- конкретные ячейки по `lockerBoxIds`.

Этот flow не использует пользовательский booking как обязательный источник доступа. Основание операции - роль оператора, станция, фильтр целей и причина открытия.

### 7.1 HTTP request

Рекомендуемый endpoint:

```text
POST /api/v1/operator/stations/:stationId/lockers/open
```

Роли:

```text
OPERATOR | ADMIN
```

Headers:

```http
Idempotency-Key: station_123:operator_123:req_operator_001
```

Открыть все ячейки станции:

```json
{
  "mode": "ALL",
  "reason": "MAINTENANCE"
}
```

Открыть ячейки определенного бизнес-статуса:

```json
{
  "mode": "STATUS",
  "status": "OCCUPIED",
  "reason": "INSPECTION"
}
```

Допустимые значения `status` должны совпадать с `LockerBox.status`:

```text
AVAILABLE | RESERVED | OCCUPIED | FAULTY | EXPIRED
```

Открыть конкретные ячейки:

```json
{
  "mode": "IDS",
  "lockerBoxIds": ["locker_55", "locker_56"],
  "reason": "CUSTOMER_SUPPORT"
}
```

### 7.2 Backend validation

Backend проверяет:

- actor аутентифицирован;
- actor имеет роль `OPERATOR` или `ADMIN`;
- station существует;
- operator имеет доступ к station, если включены station-scoped permissions;
- `mode` валиден;
- для `STATUS` передан допустимый `status`;
- для `IDS` передан непустой список `lockerBoxIds`;
- все `lockerBoxIds` из request принадлежат указанной station;
- количество целей не превышает configured batch limit;
- `reason` передан и подходит для audit.

Backend строит итоговый список целей до отправки SQS command. Если список пустой, command не отправляется.

Ошибка пустого target list:

```text
409 Conflict
```

```json
{
  "success": false,
  "status": "error",
  "error": {
    "code": "NO_LOCKERS_MATCH_FILTER",
    "message": "No lockers match operator open filter"
  }
}
```

### 7.3 Backend response

```json
{
  "success": true,
  "status": "success",
  "data": {
    "operationId": "op_batch_open_001",
    "type": "LOCKER_OPEN_BATCH",
    "status": "PENDING",
    "stationId": "station_123",
    "mode": "STATUS",
    "targetCount": 3,
    "message": "Batch locker open operation created"
  }
}
```

### 7.4 SQS command

Формат такой же, как у остальных операций:

```json
{
  "operationId": "op_batch_open_001",
  "type": "LOCKER_OPEN_BATCH",
  "payload": {
    "actorId": "operator_123",
    "actorRole": "OPERATOR",
    "stationId": "station_123",
    "mode": "STATUS",
    "status": "OCCUPIED",
    "lockerBoxIds": ["locker_55", "locker_56", "locker_57"],
    "reason": "INSPECTION",
    "requestedAt": "2026-04-29T11:00:00.000Z"
  }
}
```

Для `mode = ALL` поле `status` отсутствует, а `lockerBoxIds` содержит все выбранные backend ячейки станции.

Для `mode = IDS` поле `status` отсутствует, а `lockerBoxIds` содержит валидированный список из request.

### 7.5 Lambda simulation

Lambda получает `LOCKER_OPEN_BATCH` и для каждой ячейки выполняет ту же симуляцию, что и для `LOCKER_OPEN`: до трех внутренних попыток на каждую ячейку.

1. переводит batch operation в `PROCESSING`;
2. проходит по `lockerBoxIds`;
3. для каждой ячейки читает текущие `lockStatus` и `doorStatus` из locker record в DynamoDB;
4. если ячейка не находится в состоянии `LOCKED + CLOSED`, добавляет ее в `result.failed` с `errorCode = LOCKER_STATE_INVALID`;
5. для остальных ячеек запускает внутренний цикл до `maxAttempts = 3`;
6. на каждой попытке рандомно проверяет открытие замка;
7. если замок открылся, рандомно проверяет открытие дверцы;
8. после каждой попытки сохраняет фактические `lockStatus` и `doorStatus` внутри соответствующего locker record в DynamoDB;
9. записывает результат по каждой ячейке в `result.opened` или `result.failed`;
10. завершает operation.

Если открыта хотя бы одна ячейка, batch operation завершается `SUCCESS`, а частичные ошибки лежат в `result.failed`.

Если не открылась ни одна ячейка, batch operation завершается `FAILED`.

Успешный результат с partial failure:

```json
{
  "operationId": "op_batch_open_001",
  "type": "LOCKER_OPEN_BATCH",
  "status": "SUCCESS",
  "stationId": "station_123",
  "result": {
    "mode": "STATUS",
    "status": "OCCUPIED",
    "total": 3,
    "opened": [
      {
        "lockerBoxId": "locker_55",
        "lockStatus": "UNLOCKED",
        "doorStatus": "OPEN",
      },
      {
        "lockerBoxId": "locker_56",
        "lockStatus": "UNLOCKED",
        "doorStatus": "OPEN",
      }
    ],
    "failed": [
      {
        "lockerBoxId": "locker_57",
        "lockStatus": "LOCKED",
        "doorStatus": "CLOSED",
        "errorCode": "OPEN_ATTEMPTS_EXHAUSTED",
        "errorMessage": "Locker failed to open after 3 attempts"
      }
    ],
    "openedCount": 2,
    "failedCount": 1
  },
  "timestamp": "2026-04-29T11:00:03.000Z"
}
```

Полностью неуспешный результат:

```json
{
  "operationId": "op_batch_open_001",
  "type": "LOCKER_OPEN_BATCH",
  "status": "FAILED",
  "stationId": "station_123",
  "result": {
    "mode": "IDS",
    "total": 2,
    "opened": [],
    "failed": [
      {
        "lockerBoxId": "locker_55",
        "lockStatus": "LOCKED",
        "doorStatus": "CLOSED",
        "errorCode": "OPEN_ATTEMPTS_EXHAUSTED",
        "errorMessage": "Locker failed to open after 3 attempts"
      },
      {
        "lockerBoxId": "locker_56",
        "lockStatus": "UNLOCKED",
        "doorStatus": "CLOSED",
        "errorCode": "OPEN_ATTEMPTS_EXHAUSTED",
        "errorMessage": "Locker failed to open after 3 attempts"
      }
    ],
    "openedCount": 0,
    "failedCount": 2
  },
  "errorCode": "BATCH_OPEN_FAILED",
  "errorMessage": "No lockers were opened",
  "timestamp": "2026-04-29T11:00:03.000Z"
}
```

### 7.6 Polling batch operation

Operator frontend поллит:

```text
GET /api/v1/operations/:operationId
```

UI должен показывать:

- общее количество целей;
- сколько ячеек открылось;
- какие ячейки не открылись и почему;
- финальный статус batch operation.

Для batch-operation правило трех пользовательских попыток и `CHANGE_LOCKER` не применяется. Оператор может вручную запустить новую batch-operation с тем же или другим фильтром.

## 8. Три внутренние попытки lambda

Backend и frontend не запускают три отдельные операции для одного нажатия. Счетчик попыток находится внутри lambda execution одной operation.

Правило:

```text
attemptCount >= 3 && operation.status = FAILED -> предложить сменить ячейку
```

Ответ после трех внутренних неудачных попыток открытия:

```json
{
  "success": true,
  "status": "success",
  "data": {
    "operationId": "op_open_003",
    "type": "LOCKER_OPEN",
    "status": "FAILED",
    "bookingId": "bk_001",
    "lockerBoxId": "locker_55",
    "result": {
      "lockStatus": "LOCKED",
      "doorStatus": "CLOSED",
      "nextAction": "CHANGE_LOCKER"
    },
    "errorCode": "OPEN_ATTEMPTS_EXHAUSTED",
    "errorMessage": "Locker failed to open after 3 attempts"
  }
}
```

Ответ после трех внутренних неудачных попыток закрытия:

```json
{
  "success": true,
  "status": "success",
  "data": {
    "operationId": "op_close_003",
    "type": "LOCKER_CLOSE",
    "status": "FAILED",
    "bookingId": "bk_001",
    "lockerBoxId": "locker_55",
    "result": {
      "doorStatus": "CLOSED",
      "lockStatus": "UNLOCKED",
      "nextAction": "CHANGE_LOCKER"
    },
    "errorCode": "CLOSE_ATTEMPTS_EXHAUSTED",
    "errorMessage": "Locker failed to close after 3 attempts"
  }
}
```

Frontend при `nextAction = CHANGE_LOCKER` должен показать пользователю предложение сменить ячейку. Сам flow смены ячейки должен быть отдельным backend endpoint/operation и не должен выполняться автоматически только по факту ошибки device simulation.

## 9. Ошибки backend до SQS

Эти ошибки происходят до создания device command.

### Booking не найден

```text
404 Not Found
```

```json
{
  "success": false,
  "status": "error",
  "error": {
    "code": "BOOKING_NOT_FOUND",
    "message": "Booking not found"
  }
}
```

### Доступ запрещен

```text
403 Forbidden
```

```json
{
  "success": false,
  "status": "error",
  "error": {
    "code": "ACCESS_DENIED",
    "message": "Access denied"
  }
}
```

### Booking не активен

```text
409 Conflict
```

```json
{
  "success": false,
  "status": "error",
  "error": {
    "code": "BOOKING_NOT_ACTIVE",
    "message": "Booking is not active"
  }
}
```

### Booking истек

```text
409 Conflict
```

```json
{
  "success": false,
  "status": "error",
  "error": {
    "code": "BOOKING_EXPIRED",
    "message": "Booking has expired"
  }
}
```

### Locker из request не совпадает с booking

```text
409 Conflict
```

```json
{
  "success": false,
  "status": "error",
  "error": {
    "code": "LOCKER_BOOKING_MISMATCH",
    "message": "Locker does not match booking"
  }
}
```

### Невалидный operator filter

```text
400 Bad Request
```

```json
{
  "success": false,
  "status": "error",
  "error": {
    "code": "INVALID_LOCKER_OPEN_FILTER",
    "message": "Invalid operator locker open filter"
  }
}
```

### Превышен batch limit

```text
409 Conflict
```

```json
{
  "success": false,
  "status": "error",
  "error": {
    "code": "BATCH_LIMIT_EXCEEDED",
    "message": "Too many lockers selected for one operation"
  }
}
```

## 10. Ошибки lambda после SQS

Эти ошибки происходят после того, как operation уже создана. Frontend узнает о них через polling.

Допустимые `errorCode`:

```text
BOOKING_NOT_FOUND
ACCESS_DENIED
BOOKING_NOT_ACTIVE
BOOKING_EXPIRED
LOCKER_BOOKING_MISMATCH
LOCK_OPEN_FAILED
DOOR_OPEN_FAILED
DOOR_CLOSE_FAILED
LOCK_CLOSE_FAILED
LOCKER_STATE_INVALID
DEVICE_SIMULATION_FAILED
OPEN_ATTEMPTS_EXHAUSTED
CLOSE_ATTEMPTS_EXHAUSTED
BATCH_OPEN_FAILED
```

Формат ошибки:

```json
{
  "operationId": "op_open_001",
  "type": "LOCKER_OPEN",
  "status": "FAILED",
  "bookingId": "bk_001",
  "lockerBoxId": "locker_55",
  "result": {
    "lockStatus": "LOCKED",
    "doorStatus": "CLOSED",
    "attemptCount": 3,
    "maxAttempts": 3,
    "nextAction": "CHANGE_LOCKER"
  },
  "errorCode": "OPEN_ATTEMPTS_EXHAUSTED",
  "errorMessage": "Locker failed to open after 3 attempts",
  "timestamp": "2026-04-29T10:00:02.000Z"
}
```

## 11. Idempotency и защита от параллельных операций

Frontend передает `Idempotency-Key` header для защиты от double click и повторной отправки одного и того же действия. `clientRequestId` в body и SQS payload не используется.

Рекомендуемые idempotency keys:

```text
{bookingId}:{userId}:{requestId}
{stationId}:{actorId}:{requestId}
```

`requestId` генерируется frontend для одного пользовательского действия. При retry того же действия frontend повторяет тот же `Idempotency-Key`. Тип операции не нужно дублировать в header value, потому что backend добавляет его через idempotency `scope`.

Backend использует общий `IdempotencyService`:

1. читает header `Idempotency-Key`, fallback - `X-Idempotency-Key`;
2. если header отсутствует, выполняет handler без idempotency-защиты;
3. строит record id как `{scope}:{Idempotency-Key}`;
4. нормализует payload, сортируя ключи объектов, и считает SHA-256 hash от JSON payload;
5. пытается создать idempotency record со статусом `IN_PROGRESS`;
6. если record уже есть и hash payload совпадает:
   - при `IN_PROGRESS` возвращает `409 Conflict`;
   - при завершенном record возвращает сохраненный response с тем же status code и body;
7. если record уже есть, но hash payload отличается, возвращает `409 Conflict`;
8. после успешного handler сохраняет response status/body в idempotency record;
9. при `HttpError` сохраняет error response;
10. при непредвиденной ошибке освобождает record, чтобы retry мог выполнить handler заново.

Для device flow scope должен быть стабильным и отделять разные операции:

```text
locker-open
locker-close
locker-open-batch
```

Пример полного record id:

```text
locker-open:bk_001:user_123:req_001
```

Если один и тот же `Idempotency-Key` приходит повторно с тем же body, backend должен вернуть уже созданную operation, а не создавать новую команду для device simulator.

Backend защищает locker от параллельных команд через проверку активных operations:

- перед созданием `LOCKER_OPEN` или `LOCKER_CLOSE` backend проверяет, что для этого `bookingId` и `lockerBoxId` нет незавершенной operation со статусом `PENDING` или `PROCESSING`;
- перед созданием `LOCKER_OPEN_BATCH` backend проверяет, что выбранные `lockerBoxIds` не пересекаются с незавершенными locker operations;
- если активная operation уже есть, backend возвращает `409 LOCKER_OPERATION_IN_PROGRESS` и не отправляет новую SQS command.

## 12. Audit

Нужно логировать:

```text
LOCKER_OPEN_REQUESTED
LOCKER_OPEN_PROCESSING
LOCKER_OPEN_SUCCESS
LOCKER_OPEN_FAILED
LOCKER_CLOSE_REQUESTED
LOCKER_CLOSE_PROCESSING
LOCKER_CLOSE_SUCCESS
LOCKER_CLOSE_FAILED
LOCKER_CHANGE_REQUIRED
LOCKER_BATCH_OPEN_REQUESTED
LOCKER_BATCH_OPEN_PROCESSING
LOCKER_BATCH_OPEN_SUCCESS
LOCKER_BATCH_OPEN_FAILED
```

Минимальные audit fields:

- `actorId`
- `bookingId`
- `lockerBoxId`
- `stationId`
- `operationId`
- `operationType`
- `attemptCount`
- `lockStatus`
- `doorStatus`
- `errorCode`
- `occurredAt`
- `actorRole`
- `mode`
- `targetCount`
- `openedCount`
- `failedCount`
- `reason`

## 13. Успешный end-to-end сценарий

1. Frontend показывает кнопку "Открыть ячейку" для active booking.
2. Пользователь нажимает "Открыть ячейку".
3. Frontend отправляет backend данные booking.
4. Backend проверяет booking.
5. Backend создает operation `LOCKER_OPEN`.
6. Backend отправляет SQS command в формате `{ operationId, type, payload }`.
7. Lambda симулирует открытие замка и дверцы.
8. Lambda сохраняет `lockStatus = UNLOCKED`, `doorStatus = OPEN` внутри locker record в DynamoDB.
9. Lambda записывает тот же state в operation result и ставит `status = SUCCESS`.
10. Frontend polling получает успешную operation и показывает кнопку "Закрыть".
11. Пользователь нажимает "Закрыть".
12. Backend создает operation `LOCKER_CLOSE`.
13. Backend отправляет SQS command в формате `{ operationId, type, payload }`.
14. Lambda симулирует закрытие дверцы и замка.
15. Lambda сохраняет `doorStatus = CLOSED`, `lockStatus = LOCKED` внутри locker record в DynamoDB.
16. Lambda записывает тот же state в operation result и ставит `status = SUCCESS`.
17. Frontend polling получает успешную operation и показывает ячейку как закрытую.

## 14. Operator batch сценарий

1. Оператор выбирает station.
2. Оператор выбирает режим: все ячейки, статус или конкретные ID.
3. Frontend отправляет operator open request.
4. Backend проверяет права, station и фильтр.
5. Backend строит `lockerBoxIds`.
6. Backend создает operation `LOCKER_OPEN_BATCH`.
7. Backend отправляет SQS command в формате `{ operationId, type, payload }`.
8. Lambda симулирует открытие каждой ячейки.
9. Lambda сохраняет фактическое состояние каждой ячейки в DynamoDB locker records.
10. Lambda записывает `opened` и `failed` по каждой цели.
11. Operator frontend polling показывает итог по batch operation.

## 15. Сценарий после трех ошибок

1. Пользователь запускает открытие или закрытие.
2. Lambda три раза подряд получает неуспешный результат от simulator.
3. Третья operation завершается `FAILED`.
4. В результате operation приходит `nextAction = CHANGE_LOCKER`.
5. Frontend показывает пользователю предложение сменить ячейку.
6. Смена ячейки запускается отдельным flow и отдельной operation.
