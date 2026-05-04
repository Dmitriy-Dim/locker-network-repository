import { LockerCommand, LockerBatchCommand, OperationType, OperationStatus } from '../../types/contracts/OperationContracts';
import { LockerErrorCode, LockStatus, DoorStatus } from '../../types/contracts/LockerContracts';
import { updateOperationWithResult, getLockerDeviceState, updateLockerDeviceState } from '../../db/dynamodb';
import { simulateDeviceCommand } from './lockerDeviceSimulator';

const MAX_ATTEMPTS = 3;

const writeSuccess = (
  operationId: string,
  type: OperationType.LOCKER_OPEN | OperationType.LOCKER_CLOSE,
  bookingId: string,
  lockerBoxId: string,
  result: Record<string, unknown>,
) =>
  updateOperationWithResult(operationId, OperationStatus.SUCCESS, {
    type,
    bookingId,
    lockerBoxId,
    result,
    timestamp: new Date().toISOString(),
  });

const writeFailure = (
  operationId: string,
  type: OperationType.LOCKER_OPEN | OperationType.LOCKER_CLOSE,
  bookingId: string,
  lockerBoxId: string,
  result: Record<string, unknown>,
  errorCode: LockerErrorCode,
  errorMessage: string,
) =>
  updateOperationWithResult(operationId, OperationStatus.FAILED, {
    type,
    bookingId,
    lockerBoxId,
    result,
    errorCode,
    errorMessage,
    timestamp: new Date().toISOString(),
  });

interface AttemptResult {
  success: boolean;
  lockStatus: LockStatus;
  doorStatus: DoorStatus;
  attemptCount: number;
  errorCode?: LockerErrorCode;
  errorMessage?: string;
}

export const runOpenAttempts = async (lockerBoxId: string): Promise<AttemptResult> => {
  let lockStatus: LockStatus = 'LOCKED';
  let doorStatus: DoorStatus = 'CLOSED';
  let errorCode: LockerErrorCode | undefined;
  let errorMessage: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const deviceResult = await simulateDeviceCommand(lockerBoxId, OperationType.LOCKER_OPEN);
    lockStatus = deviceResult.lockStatus;
    doorStatus = deviceResult.doorStatus;
    errorCode = deviceResult.errorCode;
    errorMessage = deviceResult.errorMessage;

    await updateLockerDeviceState(lockerBoxId, lockStatus, doorStatus);

    if (deviceResult.success) {
      return { success: true, lockStatus, doorStatus, attemptCount: attempt };
    }
  }

  return { success: false, lockStatus, doorStatus, attemptCount: MAX_ATTEMPTS, errorCode, errorMessage };
};

const runCloseAttempts = async (lockerBoxId: string): Promise<AttemptResult> => {
  let lockStatus: LockStatus = 'UNLOCKED';
  let doorStatus: DoorStatus = 'OPEN';
  let errorCode: LockerErrorCode | undefined;
  let errorMessage: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const deviceResult = await simulateDeviceCommand(lockerBoxId, OperationType.LOCKER_CLOSE);
    lockStatus = deviceResult.lockStatus;
    doorStatus = deviceResult.doorStatus;
    errorCode = deviceResult.errorCode;
    errorMessage = deviceResult.errorMessage;

    await updateLockerDeviceState(lockerBoxId, lockStatus, doorStatus);

    if (deviceResult.success) {
      return { success: true, lockStatus, doorStatus, attemptCount: attempt };
    }
  }

  return { success: false, lockStatus, doorStatus, attemptCount: MAX_ATTEMPTS, errorCode, errorMessage };
};

export const handleLockerOpen = async (command: LockerCommand): Promise<void> => {
  const { operationId, payload } = command;
  const { userId, bookingId, lockerBoxId } = payload;

  console.log(JSON.stringify({ action: 'LOCKER_OPEN_START', operationId, lockerBoxId, bookingId, userId }));

  try {
    const deviceState = await getLockerDeviceState(lockerBoxId);

    if (!deviceState || deviceState.lockStatus !== 'LOCKED' || deviceState.doorStatus !== 'CLOSED') {
      const currentLock = deviceState?.lockStatus ?? 'UNKNOWN';
      const currentDoor = deviceState?.doorStatus ?? 'UNKNOWN';
      await writeFailure(
        operationId,
        OperationType.LOCKER_OPEN,
        bookingId,
        lockerBoxId,
        { lockStatus: currentLock, doorStatus: currentDoor, attemptCount: 0, maxAttempts: MAX_ATTEMPTS },
        LockerErrorCode.LOCKER_STATE_INVALID,
        'Locker is not in expected state for opening',
      );
      console.log(JSON.stringify({ action: 'LOCKER_OPEN_INVALID_STATE', operationId, lockerBoxId, currentLock, currentDoor }));
      return;
    }

    const { success, lockStatus, doorStatus, attemptCount, errorCode, errorMessage } =
      await runOpenAttempts(lockerBoxId);

    if (success) {
      await writeSuccess(operationId, OperationType.LOCKER_OPEN, bookingId, lockerBoxId, {
        lockStatus,
        doorStatus,
        attemptCount,
        maxAttempts: MAX_ATTEMPTS,
        nextAction: 'CLOSE_LOCKER',
        message: 'Locker opened',
      });
      console.log(JSON.stringify({ action: 'LOCKER_OPEN_SUCCESS', operationId, lockerBoxId, attemptCount }));
      return;
    }

    await writeFailure(
      operationId,
      OperationType.LOCKER_OPEN,
      bookingId,
      lockerBoxId,
      { lockStatus, doorStatus, attemptCount, maxAttempts: MAX_ATTEMPTS, nextAction: 'CHANGE_LOCKER' },
      errorCode ?? LockerErrorCode.OPEN_ATTEMPTS_EXHAUSTED,
      errorMessage ?? 'Locker failed to open after 3 attempts',
    );
    console.log(JSON.stringify({ action: 'LOCKER_OPEN_FAILED', operationId, lockerBoxId, attemptCount, errorCode }));

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected device error';
    await writeFailure(
      operationId,
      OperationType.LOCKER_OPEN,
      bookingId,
      lockerBoxId,
      { lockStatus: 'UNKNOWN', doorStatus: 'UNKNOWN' },
      LockerErrorCode.DEVICE_SIMULATION_FAILED,
      msg,
    );
    console.error(JSON.stringify({ action: 'LOCKER_OPEN_EXCEPTION', operationId, lockerBoxId, error: msg }));
  }
};

export const handleLockerClose = async (command: LockerCommand): Promise<void> => {
  const { operationId, payload } = command;
  const { userId, bookingId, lockerBoxId } = payload;

  console.log(JSON.stringify({ action: 'LOCKER_CLOSE_START', operationId, lockerBoxId, bookingId, userId }));

  try {
    const deviceState = await getLockerDeviceState(lockerBoxId);

    if (deviceState?.lockStatus === 'LOCKED' && deviceState?.doorStatus === 'CLOSED') {
      await writeSuccess(operationId, OperationType.LOCKER_CLOSE, bookingId, lockerBoxId, {
        lockStatus: 'LOCKED',
        doorStatus: 'CLOSED',
        attemptCount: 0,
        maxAttempts: MAX_ATTEMPTS,
        nextAction: 'NONE',
        message: 'Locker already closed',
      });
      console.log(JSON.stringify({ action: 'LOCKER_CLOSE_IDEMPOTENT', operationId, lockerBoxId }));
      return;
    }

    if (!deviceState || deviceState.lockStatus !== 'UNLOCKED' || deviceState.doorStatus !== 'OPEN') {
      const currentLock = deviceState?.lockStatus ?? 'UNKNOWN';
      const currentDoor = deviceState?.doorStatus ?? 'UNKNOWN';
      await writeFailure(
        operationId,
        OperationType.LOCKER_CLOSE,
        bookingId,
        lockerBoxId,
        { lockStatus: currentLock, doorStatus: currentDoor, attemptCount: 0, maxAttempts: MAX_ATTEMPTS },
        LockerErrorCode.LOCKER_STATE_INVALID,
        'Locker is not in expected state for closing',
      );
      console.log(JSON.stringify({ action: 'LOCKER_CLOSE_INVALID_STATE', operationId, lockerBoxId, currentLock, currentDoor }));
      return;
    }

    const { success, lockStatus, doorStatus, attemptCount, errorCode, errorMessage } =
      await runCloseAttempts(lockerBoxId);

    if (success) {
      await writeSuccess(operationId, OperationType.LOCKER_CLOSE, bookingId, lockerBoxId, {
        lockStatus,
        doorStatus,
        attemptCount,
        maxAttempts: MAX_ATTEMPTS,
        nextAction: 'NONE',
        message: 'Locker closed',
      });
      console.log(JSON.stringify({ action: 'LOCKER_CLOSE_SUCCESS', operationId, lockerBoxId, attemptCount }));
      return;
    }

    await writeFailure(
      operationId,
      OperationType.LOCKER_CLOSE,
      bookingId,
      lockerBoxId,
      { lockStatus, doorStatus, attemptCount, maxAttempts: MAX_ATTEMPTS, nextAction: 'CHANGE_LOCKER' },
      errorCode ?? LockerErrorCode.CLOSE_ATTEMPTS_EXHAUSTED,
      errorMessage ?? 'Locker failed to close after 3 attempts',
    );
    console.log(JSON.stringify({ action: 'LOCKER_CLOSE_FAILED', operationId, lockerBoxId, attemptCount, errorCode }));

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected device error';
    await writeFailure(
      operationId,
      OperationType.LOCKER_CLOSE,
      bookingId,
      lockerBoxId,
      { lockStatus: 'UNKNOWN', doorStatus: 'UNKNOWN' },
      LockerErrorCode.DEVICE_SIMULATION_FAILED,
      msg,
    );
    console.error(JSON.stringify({ action: 'LOCKER_CLOSE_EXCEPTION', operationId, lockerBoxId, error: msg }));
  }
};

export const handleLockerOpenBatch = async (command: LockerBatchCommand): Promise<void> => {
  const { operationId, payload } = command;
  const { actorId, stationId, mode, lockerBoxIds, status: filterStatus } = payload;

  console.log(JSON.stringify({ action: 'LOCKER_OPEN_BATCH_START', operationId, stationId, actorId, mode, total: lockerBoxIds.length }));

  const opened: { lockerBoxId: string; lockStatus: LockStatus; doorStatus: DoorStatus }[] = [];
  const failed: { lockerBoxId: string; lockStatus: string; doorStatus: string; errorCode: LockerErrorCode; errorMessage: string }[] = [];

  try {
    for (const lockerBoxId of lockerBoxIds) {
      const deviceState = await getLockerDeviceState(lockerBoxId);

      if (!deviceState || deviceState.lockStatus !== 'LOCKED' || deviceState.doorStatus !== 'CLOSED') {
        failed.push({
          lockerBoxId,
          lockStatus: deviceState?.lockStatus ?? 'UNKNOWN',
          doorStatus: deviceState?.doorStatus ?? 'UNKNOWN',
          errorCode: LockerErrorCode.LOCKER_STATE_INVALID,
          errorMessage: 'Locker is not in expected state for opening',
        });
        continue;
      }

      const { success, lockStatus, doorStatus, errorCode, errorMessage } = await runOpenAttempts(lockerBoxId);

      if (success) {
        opened.push({ lockerBoxId, lockStatus, doorStatus });
      } else {
        failed.push({
          lockerBoxId,
          lockStatus,
          doorStatus,
          errorCode: errorCode ?? LockerErrorCode.OPEN_ATTEMPTS_EXHAUSTED,
          errorMessage: errorMessage ?? 'Locker failed to open after 3 attempts',
        });
      }
    }

    const result = {
      mode,
      ...(filterStatus && { status: filterStatus }),
      total: lockerBoxIds.length,
      opened,
      failed,
      openedCount: opened.length,
      failedCount: failed.length,
    };

    if (opened.length > 0) {
      await updateOperationWithResult(operationId, OperationStatus.SUCCESS, {
        type: OperationType.LOCKER_OPEN_BATCH,
        stationId,
        result,
        timestamp: new Date().toISOString(),
      });
      console.log(JSON.stringify({ action: 'LOCKER_OPEN_BATCH_SUCCESS', operationId, stationId, openedCount: opened.length, failedCount: failed.length }));
    } else {
      await updateOperationWithResult(operationId, OperationStatus.FAILED, {
        type: OperationType.LOCKER_OPEN_BATCH,
        stationId,
        result,
        errorCode: LockerErrorCode.BATCH_OPEN_FAILED,
        errorMessage: 'No lockers were opened',
        timestamp: new Date().toISOString(),
      });
      console.log(JSON.stringify({ action: 'LOCKER_OPEN_BATCH_FAILED', operationId, stationId, failedCount: failed.length }));
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    await updateOperationWithResult(operationId, OperationStatus.FAILED, {
      type: OperationType.LOCKER_OPEN_BATCH,
      stationId,
      errorCode: LockerErrorCode.DEVICE_SIMULATION_FAILED,
      errorMessage: msg,
      timestamp: new Date().toISOString(),
    });
    console.error(JSON.stringify({ action: 'LOCKER_OPEN_BATCH_EXCEPTION', operationId, stationId, error: msg }));
  }
};
