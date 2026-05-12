import { SQSEvent } from 'aws-lambda';
import { upsertLockerCache, deleteLockerCache, initLockerDeviceState, deleteLockerDeviceState } from '../../db/dynamodb';
import { CacheProjectionEvent } from '../../types/contracts/CacheProjectionContracts';
 
export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const cacheEvent: CacheProjectionEvent = JSON.parse(record.body);
 
    console.log(JSON.stringify({
      action: 'CACHE_EVENT_RECEIVED',
      eventId: cacheEvent.eventId,
      entityType: cacheEvent.entityType,
      entityId: cacheEvent.entityId,
      eventType: cacheEvent.eventType,
      projectionVersion: cacheEvent.projectionVersion,
      correlationId: cacheEvent.correlationId,
    }));
 
    try {
      if (cacheEvent.eventType === 'UPSERT') {
        await upsertLockerCache(
          cacheEvent.entityId,
          cacheEvent.payload as unknown as Record<string, unknown>,
          cacheEvent.projectionVersion,
        );
        await initLockerDeviceState(cacheEvent.payload.lockerBoxId, cacheEvent.payload.stationId);
      } else if (cacheEvent.eventType === 'DELETE') {
        await deleteLockerCache(cacheEvent.entityId);
        await deleteLockerDeviceState(cacheEvent.entityId);
      }
 
      console.log(JSON.stringify({
        action: 'CACHE_EVENT_PROCESSED',
        eventId: cacheEvent.eventId,
        entityType: cacheEvent.entityType,
        eventType: cacheEvent.eventType,
      }));
 
    } catch (err) {
      console.error(JSON.stringify({
        action: 'CACHE_EVENT_FAILED',
        eventId: cacheEvent.eventId,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
      throw err;
    }
  }
};