"use strict";

const { randomUUID } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const dynamoDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const OPERATIONS_TABLE = process.env.OPERATIONS_TABLE || "locker-dev-operations-dynamodb";
const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE || "locker-dev-booking";
const LOCKER_CACHE_TABLE = process.env.LOCKER_CACHE_TABLE || "locker-dev-locker-cache";

const BOOKING_STATUS = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  ENDED: "ENDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
};

const LOCKER_STATUS = {
  AVAILABLE: "AVAILABLE",
  RESERVED: "RESERVED",
  OCCUPIED: "OCCUPIED",
  EXPIRED: "EXPIRED",
};

const PRICE_BY_SIZE = {
  S: 10,
  M: 15,
  L: 20,
};

const OperationStatus = {
  PROCESSING: "PROCESSING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
};

const OperationType = {
  BOOKING_CANCEL: "BOOKING_CANCEL",
  BOOKING_UPDATE_STATUS: "BOOKING_UPDATE_STATUS",
  HEALTH_CHECK: "HEALTH_CHECK",
  SECURITY_EVENT: "SECURITY_EVENT",
  BOOKING_INIT: "BOOKING_INIT",
  BOOKING_EXTEND: "BOOKING_EXTEND",
  BOOKING_EXTEND_CONFIRM: "BOOKING_EXTEND_CONFIRM",
  PAYMENT_CONFIRM: "PAYMENT_CONFIRM",
};

async function updateOperationStatus(operationId, status, errorMessage, result) {
  const expressions = ["SET #s = :status"];
  const names = { "#s": "status" };
  const values = { ":status": status };

  if (errorMessage) {
    expressions.push("errorMessage = :err");
    values[":err"] = errorMessage;
  }

  if (result) {
    expressions.push("#result = :result");
    names["#result"] = "result";
    values[":result"] = result;
  }

  await dynamoDocClient.send(new UpdateCommand({
    TableName: OPERATIONS_TABLE,
    Key: { operationId },
    UpdateExpression: expressions.join(", "),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

async function getBookingRecord(bookingId) {
  const result = await dynamoDocClient.send(new GetCommand({
    TableName: BOOKINGS_TABLE,
    Key: { bookingId },
  }));

  return result.Item;
}

async function putBookingRecord(item) {
  await dynamoDocClient.send(new PutCommand({
    TableName: BOOKINGS_TABLE,
    Item: item,
  }));
}

async function getLockerRecord(lockerBoxId) {
  const result = await dynamoDocClient.send(new GetCommand({
    TableName: LOCKER_CACHE_TABLE,
    Key: { lockerBoxId },
  }));

  return result.Item;
}

async function putLockerRecord(item) {
  await dynamoDocClient.send(new PutCommand({
    TableName: LOCKER_CACHE_TABLE,
    Item: item,
  }));
}

async function updateLockerRecord(lockerBoxId, patch) {
  const existing = await getLockerRecord(lockerBoxId);

  if (!existing) {
    return;
  }

  await putLockerRecord({
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

async function syncBookingToDynamo(bookingId, patch) {
  const existing = await getBookingRecord(bookingId);

  if (!existing) {
    return;
  }

  const nextItem = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  for (const key of Object.keys(nextItem)) {
    if (nextItem[key] === undefined) {
      delete nextItem[key];
    }
  }

  await putBookingRecord(nextItem);
}

async function findAvailableLocker(stationId, size) {
  let exclusiveStartKey;

  do {
    const result = await dynamoDocClient.send(new ScanCommand({
      TableName: LOCKER_CACHE_TABLE,
      ExclusiveStartKey: exclusiveStartKey,
      FilterExpression: "stationId = :stationId AND #size = :size AND #status = :status",
      ExpressionAttributeNames: {
        "#size": "size",
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":stationId": stationId,
        ":size": size,
        ":status": LOCKER_STATUS.AVAILABLE,
      },
    }));

    const locker = (result.Items || [])[0];
    if (locker) {
      return locker;
    }

    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return undefined;
}

function buildPaymentStub(prefix, bookingId) {
  return {
    paymentSessionId: `sess_${prefix}_${bookingId}`,
    paymentIntentId: `pi_${prefix}_${bookingId}`,
    paymentUrl: `https://localstack-payments.test/${prefix}/${bookingId}`,
  };
}

function resolveLockerStatusForBookingStatus(nextStatus, currentLockerStatus) {
  switch (nextStatus) {
    case BOOKING_STATUS.ACTIVE:
      return LOCKER_STATUS.OCCUPIED;
    case BOOKING_STATUS.CANCELLED:
    case BOOKING_STATUS.ENDED:
      return LOCKER_STATUS.AVAILABLE;
    case BOOKING_STATUS.EXPIRED:
      return LOCKER_STATUS.EXPIRED;
    default:
      return currentLockerStatus || LOCKER_STATUS.RESERVED;
  }
}

async function handleBookingInit(operationId, payload) {
  const userId = payload.userId;
  const stationId = payload.stationId;
  const size = payload.size;
  const expectedEndTime = payload.expectedEndTime;

  if (!userId || !stationId || !size || !expectedEndTime) {
    throw new Error("BOOKING_INIT payload must include userId, stationId, size, and expectedEndTime");
  }

  const locker = await findAvailableLocker(stationId, size);

  if (!locker) {
    throw new Error(`No available locker for station ${stationId} and size ${size}`);
  }

  const bookingId = payload.bookingId || randomUUID();
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const payment = buildPaymentStub("init", bookingId);
  const price = PRICE_BY_SIZE[size] || PRICE_BY_SIZE.S;

  await putBookingRecord({
    bookingId,
    operationId,
    userId,
    GSI1PK: userId,
    stationId,
    lockerBoxId: locker.lockerBoxId,
    size,
    status: BOOKING_STATUS.PENDING,
    lockerStatus: LOCKER_STATUS.RESERVED,
    paymentStatus: "PENDING",
    expectedEndTime,
    expiresAt,
    ttl: Math.floor(new Date(expiresAt).getTime() / 1000),
    price,
    amount: price,
    currency: "USD",
    paymentProvider: "stripe",
    paymentSessionId: payment.paymentSessionId,
    paymentIntentId: payment.paymentIntentId,
    paymentUrl: payment.paymentUrl,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  await updateLockerRecord(locker.lockerBoxId, {
    status: LOCKER_STATUS.RESERVED,
  });

  await updateOperationStatus(operationId, OperationStatus.SUCCESS, undefined, {
    bookingId,
    lockerBoxId: locker.lockerBoxId,
    bookingStatus: BOOKING_STATUS.PENDING,
    paymentStatus: "PENDING",
    expiresAt,
    price,
    currency: "USD",
    payment: {
      provider: "stripe",
      paymentSessionId: payment.paymentSessionId,
      paymentIntentId: payment.paymentIntentId,
      paymentUrl: payment.paymentUrl,
    },
  });
}

async function handlePaymentConfirm(operationId, payload) {
  const bookingId = payload.bookingId;
  const paymentSessionId = payload.paymentSessionId;

  if (!bookingId || !paymentSessionId) {
    throw new Error("PAYMENT_CONFIRM payload must include bookingId and paymentSessionId");
  }

  const existing = await getBookingRecord(bookingId);

  if (!existing) {
    throw new Error(`Booking not found: ${bookingId}`);
  }

  const paymentConfirmedAt = new Date().toISOString();

  await syncBookingToDynamo(bookingId, {
    status: BOOKING_STATUS.ACTIVE,
    lockerStatus: LOCKER_STATUS.OCCUPIED,
    paymentStatus: "PAID",
    paymentSessionId,
    providerPaymentId: payload.providerPaymentId,
    amount: payload.amount,
    currency: payload.currency,
    paymentConfirmedAt,
    startTime: existing.startTime || paymentConfirmedAt,
  });

  await updateLockerRecord(existing.lockerBoxId, {
    status: LOCKER_STATUS.OCCUPIED,
  });

  await updateOperationStatus(operationId, OperationStatus.SUCCESS, undefined, {
    bookingId,
    bookingStatus: BOOKING_STATUS.ACTIVE,
    paymentStatus: "PAID",
    paymentConfirmedAt,
  });
}

async function handleBookingExtend(operationId, payload) {
  const bookingId = payload.bookingId;
  const expectedEndTime = payload.expectedEndTime;

  if (!bookingId || !expectedEndTime) {
    throw new Error("BOOKING_EXTEND payload must include bookingId and expectedEndTime");
  }

  const existing = await getBookingRecord(bookingId);

  if (!existing) {
    throw new Error(`Booking not found: ${bookingId}`);
  }

  const payment = buildPaymentStub("extend", bookingId);
  const amount = PRICE_BY_SIZE[existing.size] || PRICE_BY_SIZE.S;

  await syncBookingToDynamo(bookingId, {
    extendOperationId: operationId,
    pendingExtendExpectedEndTime: expectedEndTime,
    extendPaymentStatus: "PENDING",
    extendPaymentSessionId: payment.paymentSessionId,
    extendPaymentIntentId: payment.paymentIntentId,
    extendPaymentUrl: payment.paymentUrl,
    extendAmount: amount,
    extendCurrency: existing.currency || "USD",
  });

  await updateOperationStatus(operationId, OperationStatus.SUCCESS, undefined, {
    bookingId,
    bookingStatus: existing.status,
    requestedExpectedEndTime: expectedEndTime,
    payment: {
      provider: existing.paymentProvider || "stripe",
      paymentSessionId: payment.paymentSessionId,
      paymentIntentId: payment.paymentIntentId,
      paymentUrl: payment.paymentUrl,
    },
  });
}

async function handleBookingExtendConfirm(operationId, payload) {
  const bookingId = payload.bookingId;
  const expectedEndTime = payload.expectedEndTime;

  if (!bookingId || !expectedEndTime) {
    throw new Error("BOOKING_EXTEND_CONFIRM payload must include bookingId and expectedEndTime");
  }

  const existing = await getBookingRecord(bookingId);

  if (!existing) {
    throw new Error(`Booking not found: ${bookingId}`);
  }

  const paymentConfirmedAt = new Date().toISOString();

  await syncBookingToDynamo(bookingId, {
    status: BOOKING_STATUS.ACTIVE,
    lockerStatus: LOCKER_STATUS.OCCUPIED,
    expectedEndTime,
    pendingExtendExpectedEndTime: undefined,
    extendPaymentStatus: "PAID",
    extendProviderPaymentId: payload.providerPaymentId,
    extendAmount: payload.amount,
    extendCurrency: payload.currency,
    extendPaymentConfirmedAt: paymentConfirmedAt,
  });

  await updateOperationStatus(operationId, OperationStatus.SUCCESS, undefined, {
    bookingId,
    bookingStatus: BOOKING_STATUS.ACTIVE,
    expectedEndTime,
    paymentStatus: "PAID",
    paymentConfirmedAt,
  });
}

async function handleBookingCancel(operationId, payload) {
  const bookingId = payload.bookingId;
  const actorId = payload.actorId;

  if (!bookingId || !actorId) {
    throw new Error("BOOKING_CANCEL payload must include bookingId and actorId");
  }

  const existing = await getBookingRecord(bookingId);

  if (!existing) {
    throw new Error(`Booking not found: ${bookingId}`);
  }

  const endTime = new Date().toISOString();

  await syncBookingToDynamo(bookingId, {
    status: BOOKING_STATUS.CANCELLED,
    endTime,
    lockerStatus: LOCKER_STATUS.AVAILABLE,
  });

  await updateLockerRecord(existing.lockerBoxId, {
    status: LOCKER_STATUS.AVAILABLE,
  });

  await updateOperationStatus(operationId, OperationStatus.SUCCESS, undefined, {
    bookingId,
    bookingStatus: BOOKING_STATUS.CANCELLED,
    endTime,
  });
}

async function handleBookingStatusUpdate(operationId, payload) {
  const bookingId = payload.bookingId;
  const actorId = payload.actorId;
  const nextStatus = payload.status;

  if (!bookingId || !actorId || !nextStatus) {
    throw new Error("BOOKING_UPDATE_STATUS payload must include bookingId, actorId, and status");
  }

  if (!Object.values(BOOKING_STATUS).includes(nextStatus)) {
    throw new Error(`Unsupported booking status: ${nextStatus}`);
  }

  const existing = await getBookingRecord(bookingId);

  if (!existing) {
    throw new Error(`Booking not found: ${bookingId}`);
  }

  const nextLockerStatus = resolveLockerStatusForBookingStatus(nextStatus, existing.lockerStatus);
  const endTime = nextStatus === BOOKING_STATUS.CANCELLED || nextStatus === BOOKING_STATUS.ENDED
    ? new Date().toISOString()
    : existing.endTime;

  await syncBookingToDynamo(bookingId, {
    status: nextStatus,
    lockerStatus: nextLockerStatus,
    ...(endTime ? { endTime } : {}),
  });

  await updateLockerRecord(existing.lockerBoxId, {
    status: nextLockerStatus,
  });

  await updateOperationStatus(operationId, OperationStatus.SUCCESS, undefined, {
    bookingId,
    bookingStatus: nextStatus,
    endTime: endTime || null,
  });
}

async function handleHealthCheck(operationId) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await updateOperationStatus(operationId, OperationStatus.SUCCESS, undefined, {
    operationId,
    status: "ok",
    source: "localstack",
  });
}

async function handleSecurityEvent(operationId, payload) {
  console.log(JSON.stringify({
    action: "SECURITY_EVENT_RECEIVED",
    operationId,
    payload,
  }));

  await updateOperationStatus(operationId, OperationStatus.SUCCESS, undefined, {
    operationId,
    accepted: true,
  });
}

module.exports.handler = async (event) => {
  for (const record of event.Records || []) {
    const command = JSON.parse(record.body);

    try {
      await updateOperationStatus(command.operationId, OperationStatus.PROCESSING);

      switch (command.type) {
        case OperationType.HEALTH_CHECK:
          await handleHealthCheck(command.operationId);
          break;
        case OperationType.SECURITY_EVENT:
          await handleSecurityEvent(command.operationId, command.payload || {});
          break;
        case OperationType.BOOKING_CANCEL:
          await handleBookingCancel(command.operationId, command.payload || {});
          break;
        case OperationType.BOOKING_UPDATE_STATUS:
          await handleBookingStatusUpdate(command.operationId, command.payload || {});
          break;
        case OperationType.BOOKING_INIT:
          await handleBookingInit(command.operationId, command.payload || {});
          break;
        case OperationType.PAYMENT_CONFIRM:
          await handlePaymentConfirm(command.operationId, command.payload || {});
          break;
        case OperationType.BOOKING_EXTEND:
          await handleBookingExtend(command.operationId, command.payload || {});
          break;
        case OperationType.BOOKING_EXTEND_CONFIRM:
          await handleBookingExtendConfirm(command.operationId, command.payload || {});
          break;
        default:
          throw new Error(`Unsupported localstack operation type: ${command.type}`);
      }
    } catch (error) {
      await updateOperationStatus(
        command.operationId,
        OperationStatus.FAILED,
        error instanceof Error ? error.message : "Unknown error"
      );
      throw error;
    }
  }
};
