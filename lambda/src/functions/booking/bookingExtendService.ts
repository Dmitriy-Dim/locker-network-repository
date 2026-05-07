import Stripe from 'stripe';
import { OperationStatus } from '../../types/contracts/OperationContracts';
import { BookingExtendCommand, BookingExtendResult } from '../../types/contracts/BookingContracts';
import {
  getBooking,
  getLockerCache,
  updateBookingExtendPayment,
  updateOperationWithResult,
  updateOperationStatus,
} from '../../db/dynamodb';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-03-25.dahlia',
});

const CURRENCY = 'ILS';
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'https://main.d3vb1066jloxjy.amplifyapp.com';

export const handleBookingExtend = async (command: BookingExtendCommand): Promise<void> => {
  const { operationId, payload } = command;
  const { bookingId, userId, expectedEndTime } = payload;

  console.log(JSON.stringify({ action: 'BOOKING_EXTEND_STARTED', operationId, bookingId, userId, expectedEndTime }));

  const booking = await getBooking(bookingId);

  if (!booking) {
    await updateOperationStatus(operationId, OperationStatus.FAILED, `Booking ${bookingId} not found`);
    return;
  }

  if (booking.userId !== userId) {
    await updateOperationStatus(operationId, OperationStatus.FAILED, 'User does not own this booking');
    return;
  }

  if (booking.status !== 'ACTIVE' && booking.status !== 'EXPIRED') {
    await updateOperationStatus(operationId, OperationStatus.FAILED, `Cannot extend booking with status ${booking.status}`);
    return;
  }

  const locker = await getLockerCache(booking.lockerBoxId);
  const pricePerHour = parseFloat(locker?.pricePerHour || '0');

  const currentEndTime = new Date(booking.expectedEndTime);
  const newEndTime = new Date(expectedEndTime);
  const extensionHours = Math.ceil((newEndTime.getTime() - currentEndTime.getTime()) / (1000 * 60 * 60));

  if (extensionHours <= 0) {
    await updateOperationStatus(operationId, OperationStatus.FAILED, 'New end time must be after current end time');
    return;
  }

  const extendAmount = pricePerHour * extensionHours;

  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: CURRENCY,
          product_data: {
            name: `Locker extension (${locker?.code || booking.lockerBoxId})`,
            description: `${extensionHours} hour${extensionHours > 1 ? 's' : ''} extension`,
          },
          unit_amount: Math.round(extendAmount * 100),
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${FRONTEND_BASE_URL}/payment/extend-success?bookingId=${bookingId}&operationId=${operationId}`,
    cancel_url: `${FRONTEND_BASE_URL}/payment/extend-cancel?bookingId=${bookingId}&operationId=${operationId}`,
    metadata: {
      bookingId,
      operationId,
      userId,
      paymentFlow: 'BOOKING_EXTEND',
    },
  });

  await updateBookingExtendPayment(bookingId, {
    pendingExtendEndTime: expectedEndTime,
    extendPaymentSessionId: session.id,
    extendPaymentUrl: session.url || '',
    extendAmount,
  });

  const result: BookingExtendResult = {
    bookingStatus: booking.status,
    pendingExtendEndTime: expectedEndTime,
    extendAmount,
    currency: CURRENCY,
    payment: {
      provider: 'stripe',
      paymentSessionId: session.id,
      paymentUrl: session.url || '',
    },
  };

  await updateOperationWithResult(operationId, OperationStatus.SUCCESS, {
    bookingId,
    lockerBoxId: booking.lockerBoxId,
    type: 'BOOKING_EXTEND',
    result,
  });

  console.log(JSON.stringify({ action: 'BOOKING_EXTEND_SUCCESS', operationId, bookingId, extendAmount, extensionHours }));
};
