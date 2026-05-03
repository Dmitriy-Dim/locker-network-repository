import { LockStatus, DoorStatus } from './LockerContracts';

export type CacheEntityType = 'locker_cache';
export type CacheEventType = 'UPSERT' | 'DELETE';
export type LockerSize = 'S' | 'M' | 'L';
export type LockerStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'OCCUPIED'
  | 'FAULTY'
  | 'EXPIRED';

export type StationStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';

export interface CacheProjectionEnvelope {
  eventId: string;
  schemaVersion: number;
  correlationId: string;
  occurredAt: string;
  actorId: string | null;
  entityId: string;
  eventType: CacheEventType;
  projectionVersion: number;
}

// ─── Locker cache projection ───
export interface LockerCachePayload {
  lockerBoxId: string;
  stationId: string;
  code: string;
  size: LockerSize;
  status: LockerStatus;
  lockStatus: LockStatus;
  doorStatus: DoorStatus;
  version: number;
  lastStatusChangedAt: string;
  pricePerHour: string | null;
  station: {
    address: string | null;
    latitude: number;
    longitude: number;
    status: StationStatus;
    city: {
      code: string;
      name: string;
    };
  };
}

// ─── Combined event type ───
export type CacheProjectionEvent = CacheProjectionEnvelope & {
  entityType: 'locker_cache';
  payload: LockerCachePayload;
};