// --- CORE STATUSES ---

export type LockertechStatus =
    | 'INACTIVE'
    | 'ACTIVE'
    | 'MAINTENANCE'
    | 'FAULTY';

// то, что видит пользователь
export type LockerAvailabilityStatus =
    | 'AVAILABLE'
    | 'RESERVED'
    | 'OCCUPIED';

// итоговый статус (приходит с бэка)
export type LockerStatus =
    | LockertechStatus
    | LockerAvailabilityStatus;

// --- OTHER TYPES ---

export type StationStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
export type LockerSize = 'S' | 'M' | 'L';

export interface City {
    code: string;
    name: string;
}

export interface Station {
    stationId: string;
    cityId: string;
    address: string | null;
    latitude: number;
    longitude: number;
    status: StationStatus;
    city: City;

    _count?: {
        lockers: number;
    };
    lockers?: LockerBox[];
    createdAt: string;
    updatedAt: string;
    isDeleted: boolean;
}

export interface LockerBox {
    lockerBoxId: string;
    stationId: string;
    code: string;
    size: LockerSize;

    // ключевое изменение
    techStatus: LockertechStatus;
    availabilityStatus?: LockerAvailabilityStatus;

    // временно оставим для совместимости
    status: LockerStatus;

    pricePerHour?: string;
    lastStatusChangedAt: string;
    createdAt: string;
    updatedAt: string;
    isDeleted: boolean;
}

export interface CreateStationResponse {
    id: string;
    city: string;
}

export interface CreateLockerResponse {
    id: string;
    stationId: string;
}

export interface ApiErrorResponse {
    status: string;
    message: string;
}
