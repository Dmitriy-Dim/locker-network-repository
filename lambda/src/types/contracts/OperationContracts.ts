export enum OperationType {
  HEALTH_CHECK = 'HEALTH_CHECK',
  SECURITY_EVENT = 'SECURITY_EVENT',
  BOOKING_INIT = 'BOOKING_INIT',
  PAYMENT_CONFIRM = 'PAYMENT_CONFIRM',
  BOOKING_EXTEND = 'BOOKING_EXTEND',
  LOCKER_OPEN = 'LOCKER_OPEN',
  LOCKER_CLOSE = 'LOCKER_CLOSE',
}

export enum OperationStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export interface SQSCommand {
  operationId: string;
  type: OperationType;
  payload?: Record<string, unknown>;
   // BOOKING_INIT fields (flat, not in payload)
  userId?: string;
  stationId?: string;
  size?: string;
  expectedEndTime?: string;
}

export interface OperationRecord {
  operationId: string;
  status: OperationStatus;
  type: OperationType;
  timestamp: string;
  errorMessage?: string;
}

export interface LockerCommandPayload {
  userId: string;
  bookingId: string;
  lockerBoxId: string;
  stationId: string;
  clientRequestId: string;
  requestedAt: string;
}

export interface LockerCommand {
  operationId: string;
  type: OperationType.LOCKER_OPEN | OperationType.LOCKER_CLOSE;
  payload: LockerCommandPayload;
}