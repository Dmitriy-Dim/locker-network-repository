import { OperationStatus } from '../../types/contracts/OperationContracts';
import { BookingExtendConfirmCommand } from '../../types/contracts/BookingContracts';
import {
  getBooking,
  updateBookingStatus,
  updateLockerStatus,
  updateOperationWithResult,
} from '../../db/dynamodb';

export const handleBookingExtendConfirm = async (command: BookingExtendConfirmCommand): Promise<void> => {
  const { operationId, payload } = command;
  const { bookingId, userId, expectedEndTime, paymentSessionId, providerPaymentId, amount, currency } = payload;

  console.log(JSON.stringify({ action: 'BOOKING_EXTEND_CONFIRM_STARTED', operationId, bookingId, userId }));

  const booking = await getBooking(bookingId);

  if (!booking) {
    await updateOperationWithResult(operationId, OperationStatus.FAILED, {
      errorMessage: `Booking ${bookingId} not found`,
    });
    return;
  }

  if (booking.extendPaymentSessionId !== paymentSessionId) {
    await updateOperationWithResult(operationId, OperationStatus.FAILED, {
      errorMessage: 'Payment session ID mismatch',
    });
    return;
  }

  if (booking.status !== 'ACTIVE' && booking.status !== 'EXPIRED') {
    await updateOperationWithResult(operationId, OperationStatus.FAILED, {
      errorMessage: `Cannot confirm extend for booking with status ${booking.status}`,
    });
    return;
  }

  const now = new Date().toISOString();
  const isExpiredReactivation = booking.status === 'EXPIRED';

  await updateBookingStatus(bookingId, 'ACTIVE', {
    expectedEndTime,
    providerExtendPaymentId: providerPaymentId,
    extendPaymentConfirmedAt: now,
    pendingExtendEndTime: null,
    extendPaymentSessionId: null,
    extendPaymentUrl: null,
    updatedAt: now,
    ttl: Math.floor(new Date(expectedEndTime).getTime() / 1000),
  });

  if (isExpiredReactivation) {
    await updateLockerStatus(booking.lockerBoxId, 'OCCUPIED');
  }

  await updateOperationWithResult(operationId, OperationStatus.SUCCESS, {
    bookingId,
    lockerBoxId: booking.lockerBoxId,
    type: 'BOOKING_EXTEND_CONFIRM',
    result: {
      bookingStatus: 'ACTIVE',
      expectedEndTime,
      extendAmount: amount,
      currency,
      providerPaymentId,
      wasExpiredReactivation: isExpiredReactivation,
    },
  });

  console.log(JSON.stringify({ action: 'BOOKING_EXTEND_CONFIRM_SUCCESS', operationId, bookingId, expectedEndTime, isExpiredReactivation }));
};
