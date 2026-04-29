import { DynamoDBStreamEvent } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { AttributeValue } from '@aws-sdk/client-dynamodb';
import { updateLockerStatus, createBooking } from '../../db/dynamodb';

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  for (const record of event.Records) {
    if (record.eventName !== 'REMOVE') continue;

    const oldImage = record.dynamodb?.OldImage;
    if (!oldImage) continue;

    const lockerBoxId = oldImage.lockerBoxId?.S;
    const status = oldImage.status?.S;
    const bookingId = oldImage.bookingId?.S;

    if (!lockerBoxId) continue;

    if (status === 'PENDING') {
      // Existing logic: unpaid booking expired → release locker
      console.log(JSON.stringify({
        action: 'BOOKING_TTL_EXPIRED',
        bookingId,
        lockerBoxId,
        previousStatus: status,
      }));

      await updateLockerStatus(lockerBoxId, 'AVAILABLE');

      console.log(JSON.stringify({
        action: 'LOCKER_RELEASED',
        bookingId,
        lockerBoxId,
      }));
    } else if (status === 'ACTIVE') {
      // Rental expired: customer didn't pick up items in time
      console.log(JSON.stringify({
        action: 'RENTAL_EXPIRED',
        bookingId,
        lockerBoxId,
        previousStatus: status,
      }));

      await updateLockerStatus(lockerBoxId, 'EXPIRED');

      // Re-insert booking with EXPIRED status so it remains queryable
      const booking = unmarshall(oldImage as Record<string, AttributeValue>);
      await createBooking({
        ...booking,
        status: 'EXPIRED',
        ttl: 0,
        updatedAt: new Date().toISOString(),
      });

      console.log(JSON.stringify({
        action: 'BOOKING_REINSERTED',
        bookingId,
        lockerBoxId,
        newStatus: 'EXPIRED',
      }));
    }
  }
};
