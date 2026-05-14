import { apiClient } from "./apiClient";

export interface DeviceOperationData {
    operationId: string;
    type: "LOCKER_OPEN" | "LOCKER_CLOSE" | "LOCKER_OPEN_BATCH" | "LOCKER_CLOSE_BATCH" | "BOOKING_CANCEL";
    status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED"| "EXPIRED";
    bookingId?: string;
    lockerBoxId?: string;
    stationId?: string;
    timestamp?: string;
    errorCode?: string;
    errorMessage?: string;

    // user single locker fields (top level from document)
    lockStatus?: "UNLOCKED" | "LOCKED";
    doorStatus?: "OPEN" | "CLOSED";
    attemptCount?: number;
    maxAttempts?: number;
    nextAction?: "CHANGE_LOCKER" | "CLOSE_LOCKER" | "NONE";
    message?: string;

    // batch fields (top level from document)
    mode?: string;
    total?: number;
    opened?: { lockerBoxId: string; lockStatus: string; doorStatus: string }[];
    failed?: { lockerBoxId: string; lockStatus?: string; doorStatus?: string; errorCode?: string; errorMessage?: string }[];
    openedCount?: number;
    failedCount?: number;

    closed?: { lockerBoxId: string; lockStatus: string; doorStatus: string }[];
    closedCount?: number;
    releasedCount?: number;

    result?: {
        lockStatus?: "UNLOCKED" | "LOCKED";
        doorStatus?: "OPEN" | "CLOSED";
        attemptCount?: number;
        maxAttempts?: number;
        nextAction?: "CHANGE_LOCKER" | "CLOSE_LOCKER" | "NONE";
        message?: string;
        opened?: any[];
        failed?: any[];
        openedCount?: number;
        failedCount?: number;
        total?: number;
        mode?: string;
        status?: string;
    };

    payment?: {
        provider?: string;
        paymentSessionId?: string;
        paymentIntentId?: string;
        paymentUrl?: string;
    };
}

export interface DeviceOperationResponse {
    success: boolean;
    status: string;
    data: DeviceOperationData;
}

export interface UserDevicePayload {
    bookingId: string;
    stationId: string;
    lockerBoxId: string;
}

export const devicesApi = {
    openLockerUser: async (payload: UserDevicePayload): Promise<DeviceOperationData> => {
        const { data } = await apiClient.post<DeviceOperationResponse>('/devices/open-locker', payload);
        return data.data;
    },

    closeLockerUser: async (payload: UserDevicePayload): Promise<DeviceOperationData> => {
        const { data } = await apiClient.post<DeviceOperationResponse>('/devices/close-locker', payload);
        return data.data;
    },

    openLockerOperator: async (payload: { stationId?: string; mode: string; lockerBoxIds?: string[]; status?: string; reason: string }): Promise<DeviceOperationData> => {
        const { data } = await apiClient.post<DeviceOperationResponse>('/devices/oper/open-locker', payload);
        return data.data;
    },

    // closeLockerOperator: async (lockerBoxId: string): Promise<DeviceOperationData> => {
    //     const { data } = await apiClient.post<DeviceOperationResponse>('/devices/oper/close-locker', { lockerBoxId });
    //     return data.data;
    // },
    closeLockerOperator: async (payload: { stationId: string; mode: string; lockerBoxIds?: string[]; status?: string; reason: string }): Promise<DeviceOperationData> => {
        const { data } = await apiClient.post<DeviceOperationResponse>('/devices/oper/close-locker', payload);
        return data.data;
    },

    cancelBooking: async (bookingId: string): Promise<DeviceOperationData> => {
        const { data } = await apiClient.post<DeviceOperationResponse>(`/bookings/${bookingId}/cancel`);
        return data.data;
    },

    extendBooking: async (bookingId: string, expectedEndTime: string): Promise<DeviceOperationData> => {
        const { data } = await apiClient.post<DeviceOperationResponse>(`/bookings/${bookingId}/extend`, {
            expectedEndTime
        });
        return data.data;
    },

    getOperationStatus: async (operationId: string): Promise<DeviceOperationData> => {
        const { data } = await apiClient.get<DeviceOperationResponse>(`/operations/${operationId}`);
        return data.data;
    }
};