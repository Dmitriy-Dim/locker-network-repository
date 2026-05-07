// ─── BOOKING_INIT: SQS command from frontend via API Gateway ───
export interface BookingInitCommand {
  type: 'BOOKING_INIT';
  operationId: string;
  payload: {
    userId: string;
    stationId: string;
    size: 'S' | 'M' | 'L';
    expectedEndTime: string;
  };
}
 
// ─── PAYMENT_CONFIRM: SQS command from backend after Stripe webhook ───
export interface PaymentConfirmCommand {
  type: 'PAYMENT_CONFIRM';
  operationId: string;
  payload: {
    bookingId: string;
    paymentSessionId: string;
    providerPaymentId: string;
    amount: number;
    currency: string;
  };
}

// ─── Operation result for PAYMENT_CONFIRM ───
export interface PaymentConfirmResult {
  bookingStatus: string;
  paymentStatus: string;
  startTime: string;
  expectedEndTime: string;
  price: number;
  currency: string;
}
 
// ─── BOOKING_CANCEL: SQS command from backend ───
export interface BookingCancelCommand {
  type: 'BOOKING_CANCEL';
  operationId: string;
  payload: {
    bookingId: string;
    actorId: string;
  };
}

// ─── BOOKING_EXTEND: SQS command from backend ───
export interface BookingExtendCommand {
  type: 'BOOKING_EXTEND';
  operationId: string;
  payload: {
    bookingId: string;
    userId: string;
    expectedEndTime: string;
  };
}

// ─── BOOKING_EXTEND_CONFIRM: SQS command from backend after Stripe webhook ───
export interface BookingExtendConfirmCommand {
  type: 'BOOKING_EXTEND_CONFIRM';
  operationId: string;
  payload: {
    bookingId: string;
    userId: string;
    expectedEndTime: string;
    paymentSessionId: string;
    providerPaymentId: string;
    amount: number;
    currency: string;
  };
}

// ─── Operation result for BOOKING_EXTEND ───
export interface BookingExtendResult {
  bookingStatus: string;
  pendingExtendEndTime: string;
  extendAmount: number;
  currency: string;
  payment: {
    provider: string;
    paymentSessionId: string;
    paymentUrl: string;
  };
}
 
// ─── DynamoDB booking record ───
export interface BookingRecord {
  bookingId: string;
  operationId: string;
  userId: string;
  stationId: string;
  lockerBoxId: string;
  size: string;
  status: 'PENDING' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED';
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  expectedEndTime: string;
  expiresAt: string;
  ttl: number;
  price: number;
  currency: string;
  paymentProvider: string;
  paymentSessionId: string;
  paymentIntentId: string;
  paymentUrl: string;
  providerPaymentId: string | null;
  paymentConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  pendingExtendEndTime?: string;
  extendPaymentSessionId?: string;
  extendPaymentUrl?: string;
  extendAmount?: number;
  extendPaymentConfirmedAt?: string | null;
}
 
// ─── Operation result for BOOKING_INIT ───
export interface BookingInitResult {
  bookingStatus: string;
  expiresAt: string;
  price: number;
  currency: string;
  payment: {
    provider: string;
    paymentSessionId: string;
    paymentIntentId: string;
    paymentUrl: string;
  };
}