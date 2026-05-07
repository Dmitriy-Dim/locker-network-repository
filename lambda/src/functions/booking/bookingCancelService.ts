import { OperationStatus } from '../../types/contracts/OperationContracts';
import { BookingCancelCommand } from '../../types/contracts/BookingContracts';
import {
  getBooking,
  updateBookingStatus,
  updateLockerStatus,
  updateOperationWithResult,
} from '../../db/dynamodb';

const CANCELLABLE_STATUSES = ['PENDING', 'ACTIVE', 'EXPIRED'];

export const handleBookingCancel = async (command: BookingCancelCommand): Promise<void> => {
  const { operationId, payload } = command;
  const { bookingId, actorId } = payload;

  console.log(JSON.stringify({ action: 'BOOKING_CANCEL_STARTED', operationId, bookingId, actorId }));

  const booking = await getBooking(bookingId);

  if (!booking) {
    await updateOperationWithResult(operationId, OperationStatus.FAILED, {
      errorMessage: `Booking ${bookingId} not found`,
    });
    return;
  }

  if (!CANCELLABLE_STATUSES.includes(booking.status)) {
    await updateOperationWithResult(operationId, OperationStatus.FAILED, {
      errorMessage: `Cannot cancel booking with status ${booking.status}`,
    });
    return;
  }

  const now = new Date().toISOString();

  await updateBookingStatus(bookingId, 'CANCELLED', {
    updatedAt: now,
    ttl: 0,
  });

  await updateLockerStatus(booking.lockerBoxId, 'AVAILABLE');

  await updateOperationWithResult(operationId, OperationStatus.SUCCESS, {
    bookingId,
    lockerBoxId: booking.lockerBoxId,
    type: 'BOOKING_CANCEL',
    result: {
      bookingStatus: 'CANCELLED',
      previousStatus: booking.status,
    },
  });

  console.log(JSON.stringify({ action: 'BOOKING_CANCEL_SUCCESS', operationId, bookingId, actorId, lockerBoxId: booking.lockerBoxId, previousStatus: booking.status }));
};
