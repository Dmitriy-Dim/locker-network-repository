import { LockerCommand, OperationType, OperationStatus } from '../../types/contracts/OperationContracts';
import { LockerErrorCode } from '../../types/contracts/LockerContracts';
import { updateOperationWithResult } from '../../db/dynamodb';
import { simulateDeviceCommand } from './lockerDeviceSimulator';

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

export const handleLockerOpen = async (command: LockerCommand): Promise<void> => {
  const { operationId, payload } = command;
  const { userId, bookingId, lockerBoxId } = payload;

  console.log(JSON.stringify({ action: 'LOCKER_OPEN_START', operationId, lockerBoxId, bookingId, userId }));

  try {
    const deviceResult = await simulateDeviceCommand(lockerBoxId, OperationType.LOCKER_OPEN);

    if (deviceResult.success) {
      await writeSuccess(operationId, OperationType.LOCKER_OPEN, bookingId, lockerBoxId, {
        lockStatus: deviceResult.lockStatus,
        doorStatus: deviceResult.doorStatus,
        message: deviceResult.message,
      });
      console.log(JSON.stringify({ action: 'LOCKER_OPEN_SUCCESS', operationId, lockerBoxId }));
      return;
    }

    await writeFailure(
      operationId,
      OperationType.LOCKER_OPEN,
      bookingId,
      lockerBoxId,
      { lockStatus: deviceResult.lockStatus, doorStatus: deviceResult.doorStatus, nextAction: deviceResult.nextAction },
      deviceResult.errorCode ?? LockerErrorCode.LOCK_OPEN_FAILED,
      deviceResult.errorMessage ?? 'Locker open failed',
    );
    console.log(JSON.stringify({ action: 'LOCKER_OPEN_FAILED', operationId, lockerBoxId, errorCode: deviceResult.errorCode }));

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unexpected device error';
    await writeFailure(
      operationId,
      OperationType.LOCKER_OPEN,
      bookingId,
      lockerBoxId,
      { lockStatus: 'UNKNOWN', doorStatus: 'UNKNOWN' },
      LockerErrorCode.DEVICE_SIMULATION_FAILED,
      errorMessage,
    );
    console.error(JSON.stringify({ action: 'LOCKER_OPEN_EXCEPTION', operationId, lockerBoxId, error: errorMessage }));
  }
};

export const handleLockerClose = async (command: LockerCommand): Promise<void> => {
  const { operationId, payload } = command;
  const { userId, bookingId, lockerBoxId } = payload;

  console.log(JSON.stringify({ action: 'LOCKER_CLOSE_START', operationId, lockerBoxId, bookingId, userId }));

  try {
    const deviceResult = await simulateDeviceCommand(lockerBoxId, OperationType.LOCKER_CLOSE);

    if (deviceResult.success) {
      await writeSuccess(operationId, OperationType.LOCKER_CLOSE, bookingId, lockerBoxId, {
        lockStatus: deviceResult.lockStatus,
        doorStatus: deviceResult.doorStatus,
        message: deviceResult.message,
      });
      console.log(JSON.stringify({ action: 'LOCKER_CLOSE_SUCCESS', operationId, lockerBoxId }));
      return;
    }

    await writeFailure(
      operationId,
      OperationType.LOCKER_CLOSE,
      bookingId,
      lockerBoxId,
      { lockStatus: deviceResult.lockStatus, doorStatus: deviceResult.doorStatus, nextAction: deviceResult.nextAction },
      deviceResult.errorCode ?? LockerErrorCode.LOCK_CLOSE_FAILED,
      deviceResult.errorMessage ?? 'Locker close failed',
    );
    console.log(JSON.stringify({ action: 'LOCKER_CLOSE_FAILED', operationId, lockerBoxId, errorCode: deviceResult.errorCode }));

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unexpected device error';
    await writeFailure(
      operationId,
      OperationType.LOCKER_CLOSE,
      bookingId,
      lockerBoxId,
      { lockStatus: 'UNKNOWN', doorStatus: 'UNKNOWN' },
      LockerErrorCode.DEVICE_SIMULATION_FAILED,
      errorMessage,
    );
    console.error(JSON.stringify({ action: 'LOCKER_CLOSE_EXCEPTION', operationId, lockerBoxId, error: errorMessage }));
  }
};
