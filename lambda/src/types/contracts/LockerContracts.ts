export type LockStatus = 'LOCKED' | 'UNLOCKED';
export type DoorStatus = 'OPEN' | 'CLOSED';

export interface LockerDeviceState {
  lockerBoxId: string;
  stationId: string;
  lockStatus: LockStatus;
  doorStatus: DoorStatus;
  isOnline: boolean;
  lastSensorReportAt: string;
  sensorVersion: number;
  lastCommandAt?: string;
  lastCommandType?: string;
  batteryLevel?: number;
}

export enum LockerErrorCode {
  // Validation errors (checked by backend before SQS, may also surface in Lambda)
  BOOKING_NOT_FOUND = 'BOOKING_NOT_FOUND',
  ACCESS_DENIED = 'ACCESS_DENIED',
  BOOKING_NOT_ACTIVE = 'BOOKING_NOT_ACTIVE',
  BOOKING_EXPIRED = 'BOOKING_EXPIRED',
  LOCKER_BOOKING_MISMATCH = 'LOCKER_BOOKING_MISMATCH',

  // Device-level errors (returned by physical device / simulator)
  LOCK_OPEN_FAILED = 'LOCK_OPEN_FAILED',
  DOOR_OPEN_FAILED = 'DOOR_OPEN_FAILED',
  LOCK_CLOSE_FAILED = 'LOCK_CLOSE_FAILED',
  DOOR_CLOSE_FAILED = 'DOOR_CLOSE_FAILED',

  // System / orchestration errors
  LOCKER_STATE_INVALID = 'LOCKER_STATE_INVALID',
  DEVICE_SIMULATION_FAILED = 'DEVICE_SIMULATION_FAILED',
  OPEN_ATTEMPTS_EXHAUSTED = 'OPEN_ATTEMPTS_EXHAUSTED',
  CLOSE_ATTEMPTS_EXHAUSTED = 'CLOSE_ATTEMPTS_EXHAUSTED',
  BATCH_OPEN_FAILED = 'BATCH_OPEN_FAILED',
}
