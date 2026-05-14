import { OperationStatus, OperationType } from '../../types/contracts/OperationContracts';
import { BookingEndCommand, BookingEndResult } from '../../types/contracts/BookingContracts';
import { LockerErrorCode } from '../../types/contracts/LockerContracts';
import {
  getBooking,
  getLockerDeviceState,
  updateBookingStatus,
  updateLockerStatus,
  updateOperationWithResult,
} from '../../db/dynamodb';
import { runCloseAttempts } from '../operations/lockerCommandService';

const MAX_ATTEMPTS = 3;

export const handleBookingEnd = async (command: BookingEndCommand): Promise<void> => {
  const { operationId, payload } = command;
  const { userId, stationId, lockerBoxId, bookingId, clientRequestId, requestedAt } = payload;

  console.log(JSON.stringify({
    action: 'BOOKING_END_STARTED',
    operationId,
    bookingId,
    userId,
    stationId,
    lockerBoxId,
    clientRequestId,
    requestedAt,
  }));

  const booking = await getBooking(bookingId);

  if (!booking) {
    await updateOperationWithResult(operationId, OperationStatus.FAILED, {
      type: OperationType.BOOKING_END,
      bookingId,
      lockerBoxId,
      errorCode: LockerErrorCode.BOOKING_NOT_FOUND,
      errorMessage: `Booking ${bookingId} not found`,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (booking.status === 'ENDED') {
    await updateOperationWithResult(operationId, OperationStatus.SUCCESS, {
      type: OperationType.BOOKING_END,
      bookingId,
      lockerBoxId: booking.lockerBoxId,
      result: {
        bookingStatus: 'ENDED',
        previousStatus: 'ENDED',
        endTime: booking.endTime ?? booking.updatedAt,
        lockStatus: 'LOCKED',
        doorStatus: 'CLOSED',
      } satisfies BookingEndResult,
      timestamp: new Date().toISOString(),
    });
    console.log(JSON.stringify({ action: 'BOOKING_END_IDEMPOTENT', operationId, bookingId }));
    return;
  }

  if (booking.status !== 'ACTIVE') {
    await updateOperationWithResult(operationId, OperationStatus.FAILED, {
      type: OperationType.BOOKING_END,
      bookingId,
      lockerBoxId: booking.lockerBoxId,
      errorCode: LockerErrorCode.BOOKING_NOT_ACTIVE,
      errorMessage: `Cannot end booking with status ${booking.status}`,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (booking.userId !== userId || booking.stationId !== stationId || booking.lockerBoxId !== lockerBoxId) {
    await updateOperationWithResult(operationId, OperationStatus.FAILED, {
      type: OperationType.BOOKING_END,
      bookingId,
      lockerBoxId: booking.lockerBoxId,
      errorCode: LockerErrorCode.LOCKER_BOOKING_MISMATCH,
      errorMessage: 'Booking does not match supplied user, station, or locker',
      timestamp: new Date().toISOString(),
    });
    console.log(JSON.stringify({
      action: 'BOOKING_END_MISMATCH',
      operationId,
      bookingId,
      expected: { userId: booking.userId, stationId: booking.stationId, lockerBoxId: booking.lockerBoxId },
      got: { userId, stationId, lockerBoxId },
    }));
    return;
  }

  try {
    const deviceState = await getLockerDeviceState(lockerBoxId);

    let lockStatus = deviceState?.lockStatus;
    let doorStatus = deviceState?.doorStatus;

    if (deviceState?.lockStatus === 'UNLOCKED' && deviceState?.doorStatus === 'OPEN') {
      const closeResult = await runCloseAttempts(lockerBoxId);

      if (!closeResult.success) {
        await updateOperationWithResult(operationId, OperationStatus.FAILED, {
          type: OperationType.BOOKING_END,
          bookingId,
          lockerBoxId,
          result: {
            lockStatus: closeResult.lockStatus,
            doorStatus: closeResult.doorStatus,
            attemptCount: closeResult.attemptCount,
            maxAttempts: MAX_ATTEMPTS,
          },
          errorCode: closeResult.errorCode ?? LockerErrorCode.CLOSE_ATTEMPTS_EXHAUSTED,
          errorMessage: closeResult.errorMessage ?? 'Locker failed to close after 3 attempts',
          timestamp: new Date().toISOString(),
        });
        console.log(JSON.stringify({
          action: 'BOOKING_END_CLOSE_FAILED',
          operationId,
          bookingId,
          lockerBoxId,
          attemptCount: closeResult.attemptCount,
        }));
        return;
      }

      lockStatus = closeResult.lockStatus;
      doorStatus = closeResult.doorStatus;
    } else if (deviceState?.lockStatus !== 'LOCKED' || deviceState?.doorStatus !== 'CLOSED') {
      await updateOperationWithResult(operationId, OperationStatus.FAILED, {
        type: OperationType.BOOKING_END,
        bookingId,
        lockerBoxId,
        result: {
          lockStatus: deviceState?.lockStatus ?? 'UNKNOWN',
          doorStatus: deviceState?.doorStatus ?? 'UNKNOWN',
          attemptCount: 0,
          maxAttempts: MAX_ATTEMPTS,
        },
        errorCode: LockerErrorCode.LOCKER_STATE_INVALID,
        errorMessage: 'Locker is not in expected state to end booking',
        timestamp: new Date().toISOString(),
      });
      console.log(JSON.stringify({
        action: 'BOOKING_END_INVALID_STATE',
        operationId,
        bookingId,
        lockerBoxId,
        currentLock: deviceState?.lockStatus ?? 'UNKNOWN',
        currentDoor: deviceState?.doorStatus ?? 'UNKNOWN',
      }));
      return;
    }

    const now = new Date().toISOString();

    await updateBookingStatus(bookingId, 'ENDED', {
      endTime: now,
      updatedAt: now,
      ttl: 0,
    });

    await updateLockerStatus(lockerBoxId, 'AVAILABLE');

    const result: BookingEndResult = {
      bookingStatus: 'ENDED',
      previousStatus: booking.status,
      endTime: now,
      lockStatus: lockStatus ?? 'LOCKED',
      doorStatus: doorStatus ?? 'CLOSED',
    };

    await updateOperationWithResult(operationId, OperationStatus.SUCCESS, {
      type: OperationType.BOOKING_END,
      bookingId,
      lockerBoxId,
      userId,
      result,
      timestamp: now,
    });

    console.log(JSON.stringify({
      action: 'BOOKING_END_SUCCESS',
      operationId,
      bookingId,
      userId,
      lockerBoxId,
      previousStatus: booking.status,
      endTime: now,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error during BOOKING_END';
    await updateOperationWithResult(operationId, OperationStatus.FAILED, {
      type: OperationType.BOOKING_END,
      bookingId,
      lockerBoxId,
      errorCode: LockerErrorCode.DEVICE_SIMULATION_FAILED,
      errorMessage: msg,
      timestamp: new Date().toISOString(),
    });
    console.error(JSON.stringify({ action: 'BOOKING_END_EXCEPTION', operationId, bookingId, lockerBoxId, error: msg }));
  }
};
