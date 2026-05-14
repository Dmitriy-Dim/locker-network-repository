import Stripe from 'stripe';
import { randomUUID } from 'crypto';
import { OperationStatus } from '../../types/contracts/OperationContracts';
import { BookingInitCommand, BookingInitResult, BookingRecord } from '../../types/contracts/BookingContracts';
import {
  findAvailableLocker,
  atomicBookingInit,
  updateOperationStatus,
} from '../../db/dynamodb';
 
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-03-25.dahlia',
});
 
const BOOKING_TTL_MINUTES = 30;
const CURRENCY = 'ILS';
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'https://main.d3vb1066jloxjy.amplifyapp.com';
const SUCCESS_URL = `${FRONTEND_BASE_URL}/payment/success`;
const CANCEL_URL = `${FRONTEND_BASE_URL}/payment/cancel`;
 
export const handleBookingInit = async (command: BookingInitCommand): Promise<void> => {
const {
  operationId,
  payload: { userId, stationId, size, expectedEndTime },
} = command; 
  console.log(JSON.stringify({
    action: 'BOOKING_INIT_STARTED',
    operationId,
    userId,
    stationId,
    size,
  }));
 
  // 1. Find available locker
  const locker = await findAvailableLocker(stationId, size);
 
  if (!locker) {
    console.log(JSON.stringify({
      action: 'BOOKING_INIT_NO_LOCKER',
      operationId,
      stationId,
      size,
    }));
    await updateOperationStatus(operationId, OperationStatus.FAILED, `No available ${size} locker at station ${stationId}`);
    return;
  }
 
  // 2. Calculate price
  const now = new Date();
  const endTime = new Date(expectedEndTime);
  const hours = Math.ceil((endTime.getTime() - now.getTime()) / (1000 * 60 * 60));
  const pricePerHour = parseFloat(locker.pricePerHour || '0');
  const totalPrice = pricePerHour * hours;
 
  // 3. Create Stripe Checkout Session
  const bookingId = randomUUID();
 
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: CURRENCY,
          product_data: {
            name: `Locker ${locker.code} (${size})`,
            description: `Station: ${locker.station?.address || stationId}, ${hours} hours`,
          },
          unit_amount: Math.round(totalPrice * 100), // Stripe uses cents
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${SUCCESS_URL}?bookingId=${bookingId}&operationId=${operationId}`,
    cancel_url: `${CANCEL_URL}?bookingId=${bookingId}&operationId=${operationId}`,
    expires_at: Math.floor(now.getTime() / 1000) + BOOKING_TTL_MINUTES * 60,
    metadata: {
      bookingId,
      operationId,
      userId,
      lockerBoxId: locker.lockerBoxId,
    },
  });
 
  // 4. Build booking record
  const expiresAt = new Date(now.getTime() + BOOKING_TTL_MINUTES * 60 * 1000);
 
  const booking: BookingRecord = {
    bookingId,
    operationId,
    userId,
    GSI1PK: userId,
    stationId,
    lockerBoxId: locker.lockerBoxId,
    size,
    status: 'PENDING',
    paymentStatus: 'PENDING',
    expectedEndTime,
    expiresAt: expiresAt.toISOString(),
    ttl: Math.floor(expiresAt.getTime() / 1000),
    price: totalPrice,
    currency: CURRENCY,
    paymentProvider: 'stripe',
    paymentSessionId: session.id,
    paymentIntentId: session.payment_intent as string || '',
    paymentUrl: session.url || '',
    providerPaymentId: null,
    paymentConfirmedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
 
  // 5. Atomic write: booking + reserve locker + update operation
  const operationResult: BookingInitResult = {
    bookingStatus: 'PENDING',
    expiresAt: expiresAt.toISOString(),
    price: totalPrice,
    currency: CURRENCY,
    payment: {
      provider: 'stripe',
      paymentSessionId: session.id,
      paymentIntentId: session.payment_intent as string || '',
      paymentUrl: session.url || '',
    },
  };
 
    // 6. Atomic write: booking + reserve locker + update operation
  try {
    await atomicBookingInit(
      booking as unknown as Record<string, unknown>,
      locker.lockerBoxId,
      operationId,
      operationResult as unknown as Record<string, unknown>,
    );
  } catch (err) {
    console.error(JSON.stringify({
      action: 'BOOKING_INIT_TRANSACTION_FAILED',
      operationId,
      lockerBoxId: locker.lockerBoxId,
      error: err instanceof Error ? err.message : 'Unknown error',
    }));
    await updateOperationStatus(operationId, OperationStatus.FAILED, 'Locker was taken by another user');
    return;
  }
 
  console.log(JSON.stringify({
    action: 'BOOKING_INIT_SUCCESS',
    operationId,
    bookingId,
    lockerBoxId: locker.lockerBoxId,
    price: totalPrice,
  }));
};