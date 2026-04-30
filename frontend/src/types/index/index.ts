// ================================
// STATION
// ================================

export type StationStatus =
    | "ACTIVE"
    | "INACTIVE"
    | "MAINTENANCE";

// ================================
// LOCKER TYPES
// ================================

export type LockerSize = "S" | "M" | "L";

// статус для пользователя
export type LockerStatus =
    | "AVAILABLE"
    | "RESERVED"
    | "OCCUPIED"
    | "EXPIRED";

// технический статус (админ/оператор)
export type LockerTechStatus =
    | "INACTIVE"
    | "ACTIVE"
    | "MAINTENANCE"
    | "FAULTY";

// ================================
// ENTITIES
// ================================

export interface City {
    code: string;
    name: string;
}

export interface LockerBox {
    lockerBoxId: string;
    stationId: string;
    code: string;
    size: LockerSize;

    status: LockerStatus | null;
    techStatus: LockerTechStatus;
}

export interface LockerStation {
    stationId: string;
    city: string | City;
    address: string | null;
    latitude: number;
    longitude: number;
    status: StationStatus;

    lockers: LockerBox[];

    _count?: {
        lockers: number;
    };
}