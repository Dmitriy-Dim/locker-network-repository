import { apiClient } from "./apiClient";

export interface DeviceOperationData {
    operationId: string;
    type: "LOCKER_OPEN" | "LOCKER_CLOSE" | "BOOKING_CANCEL";
    status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
    bookingId: string;
    lockerBoxId?: string;
    result?: {
        lockStatus: "UNLOCKED" | "LOCKED";
        doorStatus: "OPEN" | "CLOSED";
        message?: string;
        nextAction?: string;
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
    openLocker: async (bookingId: string): Promise<DeviceOperationData> => {
        const { data } = await apiClient.post<DeviceOperationResponse>('/devices/open-locker', { bookingId });
        return data.data;
    },

    closeLocker: async (bookingId: string): Promise<DeviceOperationData> => {
        const { data } = await apiClient.post<DeviceOperationResponse>('/devices/close-locker', { bookingId });
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