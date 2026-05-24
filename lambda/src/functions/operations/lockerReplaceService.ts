import {
  LockerReplaceCommand,
  LockerReplaceResult,
  OperationStatus,
  OperationType,
} from '../../types/contracts/OperationContracts';
import { LockerErrorCode } from '../../types/contracts/LockerContracts';
import {
  atomicLockerReplace,
  findAvailableLocker,
  getBooking,
  updateOperationWithResult,
} from '../../db/dynamodb';

const MAX_FIND_ATTEMPTS = 3;

const writeFailure = (
  operationId: string,
  bookingId: string,
  lockerBoxId: string,
  errorCode: LockerErrorCode,
  errorMessage: string,
) =>
  updateOperationWithResult(operationId, OperationStatus.FAILED, {
    type: OperationType.LOCKER_REPLACE,
    bookingId,
    lockerBoxId,
    errorCode,
    errorMessage,
    timestamp: new Date().toISOString(),
  });

export const handleLockerReplace = async (command: LockerReplaceCommand): Promise<void> => {
  const { operationId, payload } = command;
  const {
    userId,
    bookingId,
    stationId,
    lockerBoxId: oldLockerBoxId,
    failedOperationId,
    failedOperationType,
    reason,
    clientRequestId,
    requestedAt,
  } = payload;

  console.log(JSON.stringify({
    action: 'LOCKER_REPLACE_START',
    operationId,
    bookingId,
    userId,
    stationId,
    oldLockerBoxId,
    failedOperationId,
    failedOperationType,
    reason,
    clientRequestId,
    requestedAt,
  }));

  const booking = await getBooking(bookingId);

  if (!booking) {
    await writeFailure(
      operationId,
      bookingId,
      oldLockerBoxId,
      LockerErrorCode.BOOKING_NOT_FOUND,
      `Booking ${bookingId} not found`,
    );
    return;
  }

  if (
    booking.userId !== userId ||
    booking.stationId !== stationId ||
    booking.lockerBoxId !== oldLockerBoxId
  ) {
    await writeFailure(
      operationId,
      bookingId,
      oldLockerBoxId,
      LockerErrorCode.LOCKER_BOOKING_MISMATCH,
      'Booking does not match supplied user, station, or locker',
    );
    console.log(JSON.stringify({
      action: 'LOCKER_REPLACE_MISMATCH',
      operationId,
      bookingId,
      expected: {
        userId: booking.userId,
        stationId: booking.stationId,
        lockerBoxId: booking.lockerBoxId,
      },
      got: { userId, stationId, lockerBoxId: oldLockerBoxId },
    }));
    return;
  }

  const size = booking.size as string | undefined;

  if (!size) {
    await writeFailure(
      operationId,
      bookingId,
      oldLockerBoxId,
      LockerErrorCode.NO_AVAILABLE_REPLACEMENT_LOCKER,
      'Booking has no size — cannot pick replacement',
    );
    return;
  }

  for (let attempt = 1; attempt <= MAX_FIND_ATTEMPTS; attempt++) {
    const candidate = await findAvailableLocker(stationId, size);

    if (!candidate) {
      await writeFailure(
        operationId,
        bookingId,
        oldLockerBoxId,
        LockerErrorCode.NO_AVAILABLE_REPLACEMENT_LOCKER,
        'No available locker with the same size on this station',
      );
      console.log(JSON.stringify({
        action: 'LOCKER_REPLACE_NO_AVAILABLE',
        operationId,
        bookingId,
        stationId,
        size,
      }));
      return;
    }

    const newLockerBoxId = candidate.lockerBoxId as string;

    try {
      await atomicLockerReplace(bookingId, oldLockerBoxId, newLockerBoxId);

      const result: LockerReplaceResult = {
        oldLockerBoxId,
        newLockerBoxId,
        stationId,
        bookingId,
        reason,
        failedOperationId,
        failedOperationType,
        nextAction: 'OPEN_NEW_LOCKER',
        message: 'Locker replaced!',
      };

      await updateOperationWithResult(operationId, OperationStatus.SUCCESS, {
        type: OperationType.LOCKER_REPLACE,
        bookingId,
        lockerBoxId: oldLockerBoxId,
        result,
        timestamp: new Date().toISOString(),
      });

      console.log(JSON.stringify({
        action: 'LOCKER_REPLACE_SUCCESS',
        operationId,
        bookingId,
        oldLockerBoxId,
        newLockerBoxId,
        stationId,
        attempt,
      }));
      return;
    } catch (err) {
      const errName = err instanceof Error ? err.name : '';
      const errMsg = err instanceof Error ? err.message : 'Unknown error';

      const isRaceLost =
        errName === 'TransactionCanceledException' ||
        errMsg.includes('ConditionalCheckFailed');

      console.log(JSON.stringify({
        action: 'LOCKER_REPLACE_TRANSACTION_FAILED',
        operationId,
        bookingId,
        oldLockerBoxId,
        attemptedLockerBoxId: newLockerBoxId,
        attempt,
        errName,
        errMsg,
        willRetry: isRaceLost && attempt < MAX_FIND_ATTEMPTS,
      }));

      if (!isRaceLost) {
        await writeFailure(
          operationId,
          bookingId,
          oldLockerBoxId,
          LockerErrorCode.NO_AVAILABLE_REPLACEMENT_LOCKER,
          errMsg,
        );
        return;
      }
    }
  }

  await writeFailure(
    operationId,
    bookingId,
    oldLockerBoxId,
    LockerErrorCode.NO_AVAILABLE_REPLACEMENT_LOCKER,
    'No available locker with the same size on this station',
  );
};
