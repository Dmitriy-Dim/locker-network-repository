import { apiClient } from "./apiClient";

export interface DeviceOperationData {
    operationId: string;
    type: "LOCKER_OPEN" | "LOCKER_CLOSE" | "LOCKER_OPEN_BATCH" | "BOOKING_CANCEL";
    status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
    bookingId?: string;
    lockerBoxId?: string;
    stationId?: string;
    result?: {
        lockStatus: "UNLOCKED" | "LOCKED";
        doorStatus: "OPEN" | "CLOSED";
        attemptCount?: number;
        maxAttempts?: number;
        nextAction?: "CHANGE_LOCKER" | "CLOSE_LOCKER" | "NONE";
        message?: string;
    };
    errorCode?: string;
    errorMessage?: string;
    timestamp?: string;
}

export interface DeviceOperationResponse {
    success: boolean;
    status: string;
    data: DeviceOperationData;
}

export const devicesApi = {
    openLockerUser: async (bookingId: string): Promise<DeviceOperationData> => {
        const { data } = await apiClient.post<DeviceOperationResponse>('/devices/open-locker', { bookingId });
        return data.data;
    },

    closeLockerUser: async (bookingId: string): Promise<DeviceOperationData> => {
        const { data } = await apiClient.post<DeviceOperationResponse>('/devices/close-locker', { bookingId });
        return data.data;
    },

    openLockerOperator: async (payload: { mode: string; lockerBoxIds?: string[]; status?: string; reason: string }): Promise<DeviceOperationData> => {
        const { data } = await apiClient.post<DeviceOperationResponse>('/devices/oper/open-locker', payload);
        return data.data;
    },

    closeLockerOperator: async (lockerBoxId: string): Promise<DeviceOperationData> => {
        const { data } = await apiClient.post<DeviceOperationResponse>('/devices/oper/close-locker', { lockerBoxId });
        return data.data;
    },

    cancelBooking: async (bookingId: string): Promise<DeviceOperationData> => {
        const { data } = await apiClient.post<DeviceOperationResponse>(`/bookings/${bookingId}/cancel`);
        return data.data;
    },

    getOperationStatus: async (operationId: string): Promise<DeviceOperationData> => {
        const { data } = await apiClient.get<DeviceOperationResponse>(`/operations/${operationId}`);
        return data.data;
    },
};