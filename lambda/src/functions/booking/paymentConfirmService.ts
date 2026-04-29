import { OperationStatus } from '../../types/contracts/OperationContracts';
import { PaymentConfirmCommand, PaymentConfirmResult } from '../../types/contracts/BookingContracts';
import {
  getBooking,
  updateBookingStatus,
  updateLockerStatus,
  updateOperationWithResult,
} from '../../db/dynamodb';
 
export const handlePaymentConfirm = async (command: PaymentConfirmCommand): Promise<void> => {
  const { operationId, payload } = command;
  const { bookingId, paymentSessionId, providerPaymentId, amount, currency } = payload;
 
  console.log(JSON.stringify({
    action: 'PAYMENT_CONFIRM_STARTED',
    operationId,
    bookingId,
    paymentSessionId,
  }));
 
  // 1. Read booking
  const booking = await getBooking(bookingId);
 
  if (!booking) {
    console.error(JSON.stringify({ action: 'PAYMENT_CONFIRM_NOT_FOUND', bookingId }));
    await updateOperationWithResult(operationId, OperationStatus.FAILED, {
      errorMessage: `Booking ${bookingId} not found`,
    });
    return;
  }
 
  // 2. Already active — idempotent
  if (booking.status === 'ACTIVE' && booking.paymentStatus === 'PAID') {
    console.log(JSON.stringify({ action: 'PAYMENT_CONFIRM_ALREADY_ACTIVE', bookingId }));
    await updateOperationWithResult(operationId, OperationStatus.SUCCESS, {
      bookingId,
      result: {
        bookingStatus: 'ACTIVE',
        paymentStatus: 'PAID',
      },
    });
    return;
  }
 
  // 3. Must be PENDING
  if (booking.status !== 'PENDING') {
    console.error(JSON.stringify({ action: 'PAYMENT_CONFIRM_WRONG_STATUS', bookingId, status: booking.status }));
    await updateOperationWithResult(operationId, OperationStatus.FAILED, {
      errorMessage: `Booking status is ${booking.status}, expected PENDING`,
    });
    return;
  }
 
  // 4. Check TTL
  const now = new Date();
  const expiresAt = new Date(booking.expiresAt);
  if (now > expiresAt) {
    console.error(JSON.stringify({ action: 'PAYMENT_CONFIRM_EXPIRED', bookingId, expiresAt: booking.expiresAt }));
    await updateOperationWithResult(operationId, OperationStatus.FAILED, {
      errorMessage: `Booking expired at ${booking.expiresAt}`,
    });
    return;
  }
 
  // 5. Check paymentSessionId match
  if (booking.paymentSessionId !== paymentSessionId) {
    console.error(JSON.stringify({
      action: 'PAYMENT_CONFIRM_SESSION_MISMATCH',
      bookingId,
      expected: booking.paymentSessionId,
      received: paymentSessionId,
    }));
    await updateOperationWithResult(operationId, OperationStatus.FAILED, {
      errorMessage: 'Payment session ID mismatch',
    });
    return;
  }
 
  // 6. Activate booking
  const confirmedAt = now.toISOString();
 
  await updateBookingStatus(bookingId, 'ACTIVE', {
    paymentStatus: 'PAID',
    providerPaymentId,
    paymentConfirmedAt: confirmedAt,
    updatedAt: confirmedAt,
    ttl: Math.floor(new Date(booking.expectedEndTime).getTime() / 1000),
  });
 
  // 7. Update locker: RESERVED → OCCUPIED
  await updateLockerStatus(booking.lockerBoxId, 'OCCUPIED');
 
  // 8. Update operation with full result
  const result: PaymentConfirmResult = {
    bookingStatus: 'ACTIVE',
    paymentStatus: 'PAID',
    startTime: confirmedAt,
    expectedEndTime: booking.expectedEndTime,
    price: booking.price,
    currency: booking.currency,
  };

  await updateOperationWithResult(operationId, OperationStatus.SUCCESS, {
    bookingId,
    lockerBoxId: booking.lockerBoxId,
    type: 'PAYMENT_CONFIRM',
    result,
  });
 
  console.log(JSON.stringify({
    action: 'PAYMENT_CONFIRM_SUCCESS',
    operationId,
    bookingId,
    lockerBoxId: booking.lockerBoxId,
  }));
};