import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { LockerDeviceState, LockStatus, DoorStatus } from '../types/contracts/LockerContracts';
 
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
 
const LOCKER_CACHE_TABLE = process.env.LOCKER_CACHE_TABLE || 'locker-dev-locker-cache';
const OPERATIONS_TABLE = process.env.OPERATIONS_TABLE || 'locker-dev-operations-dynamodb';
const BOOKING_TABLE = process.env.BOOKING_TABLE || 'locker-dev-booking';
const LOCKER_DEVICE_STATE_TABLE = process.env.LOCKER_DEVICE_STATE_TABLE || 'locker-dev-device-state';
 
// ─── Operations table ───
 
export const updateOperationStatus = async (
  operationId: string,
  status: string,
  errorMessage?: string,
) => {
  await docClient.send(new UpdateCommand({
    TableName: OPERATIONS_TABLE,
    Key: { operationId },
    UpdateExpression: errorMessage
      ? 'SET #s = :status, errorMessage = :err'
      : 'SET #s = :status',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':status': status,
      ...(errorMessage && { ':err': errorMessage }),
    },
  }));
};
 
export const updateOperationWithResult = async (
  operationId: string,
  status: string,
  extra: Record<string, unknown>,
) => {
  const setParts = ['#s = :status'];
  const names: Record<string, string> = { '#s': 'status' };
  const values: Record<string, unknown> = { ':status': status };
 
  for (const [key, value] of Object.entries(extra)) {
    setParts.push(`#${key} = :${key}`);
    names[`#${key}`] = key;
    values[`:${key}`] = value;
  }
 
  await docClient.send(new UpdateCommand({
    TableName: OPERATIONS_TABLE,
    Key: { operationId },
    UpdateExpression: `SET ${setParts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
};
 
// ─── Locker cache ───
 
export const upsertLockerCache = async (
  lockerBoxId: string,
  payload: Record<string, unknown>,
  version: number,
) => {
  const existing = await docClient.send(new GetCommand({
    TableName: LOCKER_CACHE_TABLE,
    Key: { lockerBoxId },
  }));
 
  if (existing.Item && (existing.Item.version as number) >= version) {
    console.log(JSON.stringify({
      action: 'SKIP_STALE_UPDATE',
      lockerBoxId,
      existingVersion: existing.Item.version,
      incomingVersion: version,
    }));
    return;
  }
 
  await docClient.send(new PutCommand({
    TableName: LOCKER_CACHE_TABLE,
    Item: {
      ...payload,
      lockerBoxId,
      lockStatus: existing.Item?.lockStatus ?? 'LOCKED',
      doorStatus: existing.Item?.doorStatus ?? 'CLOSED',
    },
  }));
};
 
export const deleteLockerCache = async (lockerBoxId: string) => {
  await docClient.send(new DeleteCommand({
    TableName: LOCKER_CACHE_TABLE,
    Key: { lockerBoxId },
  }));
};
 
export const findAvailableLocker = async (stationId: string, size: string) => {
  const result = await docClient.send(new QueryCommand({
    TableName: LOCKER_CACHE_TABLE,
    IndexName: 'stationId-index',
    KeyConditionExpression: 'stationId = :stationId',
    FilterExpression: '#size = :size AND #status = :status',
    ExpressionAttributeNames: {
      '#size': 'size',
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':stationId': stationId,
      ':size': size,
      ':status': 'AVAILABLE',
    },
  }));

  return result.Items?.[0] || null;
};
 
export const getLockerCache = async (lockerBoxId: string) => {
  const result = await docClient.send(new GetCommand({
    TableName: LOCKER_CACHE_TABLE,
    Key: { lockerBoxId },
  }));
  return result.Item || null;
};

export const updateBookingExtendPayment = async (
  bookingId: string,
  fields: {
    pendingExtendEndTime: string;
    extendPaymentSessionId: string;
    extendPaymentUrl: string;
    extendAmount: number;
  },
) => {
  await docClient.send(new UpdateCommand({
    TableName: BOOKING_TABLE,
    Key: { bookingId },
    UpdateExpression: 'SET pendingExtendEndTime = :pet, extendPaymentSessionId = :eps, extendPaymentUrl = :epu, extendAmount = :ea',
    ExpressionAttributeValues: {
      ':pet': fields.pendingExtendEndTime,
      ':eps': fields.extendPaymentSessionId,
      ':epu': fields.extendPaymentUrl,
      ':ea': fields.extendAmount,
    },
  }));
};

// ─── Locker device state (sensor source of truth) ───

export const getLockerDeviceState = async (lockerBoxId: string): Promise<LockerDeviceState | null> => {
  const result = await docClient.send(new GetCommand({
    TableName: LOCKER_DEVICE_STATE_TABLE,
    Key: { lockerBoxId },
  }));
  return (result.Item as LockerDeviceState) || null;
};

export const updateLockerDeviceState = async (
  lockerBoxId: string,
  lockStatus: LockStatus,
  doorStatus: DoorStatus,
) => {
  await docClient.send(new UpdateCommand({
    TableName: LOCKER_DEVICE_STATE_TABLE,
    Key: { lockerBoxId },
    UpdateExpression: 'SET lockStatus = :lock, doorStatus = :door, lastSensorReportAt = :now, sensorVersion = sensorVersion + :inc',
    ExpressionAttributeValues: {
      ':lock': lockStatus,
      ':door': doorStatus,
      ':now': new Date().toISOString(),
      ':inc': 1,
    },
  }));
};

export const deleteLockerDeviceState = async (lockerBoxId: string): Promise<void> => {
  await docClient.send(new DeleteCommand({
    TableName: LOCKER_DEVICE_STATE_TABLE,
    Key: { lockerBoxId },
  }));
};

export const initLockerDeviceState = async (lockerBoxId: string, stationId: string): Promise<void> => {
  await docClient.send(new PutCommand({
    TableName: LOCKER_DEVICE_STATE_TABLE,
    Item: {
      lockerBoxId,
      stationId,
      lockStatus: 'LOCKED',
      doorStatus: 'CLOSED',
      isOnline: true,
      lastSensorReportAt: new Date().toISOString(),
      sensorVersion: 0,
    } satisfies LockerDeviceState,
    ConditionExpression: 'attribute_not_exists(lockerBoxId)',
  }));
};

export const updateLockerStatus = async (lockerBoxId: string, status: string) => {
  await docClient.send(new UpdateCommand({
    TableName: LOCKER_CACHE_TABLE,
    Key: { lockerBoxId },
    UpdateExpression: 'SET #s = :status, lastStatusChangedAt = :now, version = version + :inc',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':status': status,
      ':now': new Date().toISOString(),
      ':inc': 1,
    },
  }));
};
 
// ─── Booking table ───
 
export const createBooking = async (booking: Record<string, unknown>) => {
  await docClient.send(new PutCommand({
    TableName: BOOKING_TABLE,
    Item: booking,
  }));
};
 
export const getBooking = async (bookingId: string) => {
  const result = await docClient.send(new GetCommand({
    TableName: BOOKING_TABLE,
    Key: { bookingId },
  }));
  return result.Item || null;
};
 
export const updateBookingStatus = async (
  bookingId: string,
  status: string,
  extra?: Record<string, unknown>,
) => {
  const setParts = ['#s = :status'];
  const names: Record<string, string> = { '#s': 'status' };
  const values: Record<string, unknown> = { ':status': status };
 
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      setParts.push(`#${key} = :${key}`);
      names[`#${key}`] = key;
      values[`:${key}`] = value;
    }
  }
 
  await docClient.send(new UpdateCommand({
    TableName: BOOKING_TABLE,
    Key: { bookingId },
    UpdateExpression: `SET ${setParts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
};
 
// ─── Atomic transaction: replace broken locker ───

export const atomicLockerReplace = async (
  bookingId: string,
  oldLockerBoxId: string,
  newLockerBoxId: string,
) => {
  const now = new Date().toISOString();

  await docClient.send(new TransactWriteCommand({
    TransactItems: [
      {
        Update: {
          TableName: LOCKER_CACHE_TABLE,
          Key: { lockerBoxId: oldLockerBoxId },
          UpdateExpression: 'SET #s = :faulty, lastStatusChangedAt = :now, version = version + :inc',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':faulty': 'FAULTY',
            ':now': now,
            ':inc': 1,
          },
        },
      },
      {
        Update: {
          TableName: LOCKER_CACHE_TABLE,
          Key: { lockerBoxId: newLockerBoxId },
          UpdateExpression: 'SET #s = :reserved, lastStatusChangedAt = :now, version = version + :inc',
          ConditionExpression: '#s = :available',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':reserved': 'RESERVED',
            ':available': 'AVAILABLE',
            ':now': now,
            ':inc': 1,
          },
        },
      },
      {
        Update: {
          TableName: BOOKING_TABLE,
          Key: { bookingId },
          UpdateExpression: 'SET lockerBoxId = :newLockerBoxId, updatedAt = :now',
          ExpressionAttributeValues: {
            ':newLockerBoxId': newLockerBoxId,
            ':now': now,
          },
        },
      },
    ],
  }));
};

// ─── Atomic transaction: create booking + reserve locker + update operation ───
 
export const atomicBookingInit = async (
  booking: Record<string, unknown>,
  lockerBoxId: string,
  operationId: string,
  operationResult: Record<string, unknown>,
) => {
  await docClient.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: BOOKING_TABLE,
          Item: booking,
        },
      },
      {
        Update: {
          TableName: LOCKER_CACHE_TABLE,
          Key: { lockerBoxId },
          UpdateExpression: 'SET #s = :reserved, lastStatusChangedAt = :now, version = version + :inc',
          ConditionExpression: '#s = :available',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':reserved': 'RESERVED',
            ':available': 'AVAILABLE',
            ':now': new Date().toISOString(),
            ':inc': 1,
          },
        },
      },
      {
        Update: {
          TableName: OPERATIONS_TABLE,
          Key: { operationId },
          UpdateExpression: 'SET #s = :status, #bid = :bookingId, #lid = :lockerBoxId, #r = :result, #uid = :userId, #ts = :timestamp',
          ExpressionAttributeNames: {
            '#s': 'status',
            '#bid': 'bookingId',
            '#lid': 'lockerBoxId',
            '#r': 'result',
            '#uid': 'userId',
            '#ts': 'timestamp',
          },
          ExpressionAttributeValues: {
            ':status': 'SUCCESS',
            ':bookingId': booking.bookingId as string,
            ':lockerBoxId': lockerBoxId,
            ':result': operationResult,
            ':userId': booking.userId as string,
            ':timestamp': new Date().toISOString(),
          },
        },
      },
    ],
  }));
};