import { apiClient } from "./apiClient";
import type { LockerBox, LockerTechStatus, LockerStatus } from "../types/index";

export interface ApiResponse<T> {
    success: boolean;
    correlationId?: string;
    data: T;
    error?: {
        code: string;
        message: string;
    };
}

export const lockersApi = {

    getLockers: async (params?: {
        stationId?: string;
        size?: string;
        status?: string;
    }): Promise<LockerBox[]> => {
        const { data } = await apiClient.get<ApiResponse<LockerBox[]>>(
            "/lockers/boxes",
            { params }
        );
        return data.data;
    },

    getLockerById: async (id: string): Promise<LockerBox> => {
        const { data } = await apiClient.get<ApiResponse<LockerBox>>(
            `/lockers/boxes/${id}`
        );
        return data.data;
    },

    // OPERATOR endpoint
    updateLockerTechStatusOperator: async (
        id: string,
        techStatus: LockerTechStatus
    ): Promise<LockerBox> => {
        const { data } = await apiClient.patch<ApiResponse<LockerBox>>(
            `/lockers/oper/boxes/${id}/tech-status`,
            { techStatus }
        );
        return data.data;
    },

    // (если вдруг понадобится админ)
    updateLockerTechStatusAdmin: async (
        id: string,
        techStatus: LockerTechStatus
    ): Promise<LockerBox> => {
        const { data } = await apiClient.patch<ApiResponse<LockerBox>>(
            `/lockers/admin/boxes/${id}/tech-status`,
            { techStatus }
        );
        return data.data;
    },

    // OPERATOR endpoint for business status
    updateLockerStatusOperator: async (
        lockerBoxId: string,
        status: LockerStatus
    ): Promise<LockerBox> => {
        const { data } = await apiClient.patch<ApiResponse<LockerBox>>(
            `/lockers/oper/boxes/${lockerBoxId}/status`,
            { status }
        );
        return data.data;
    },

    getAdminLockers: async (): Promise<LockerBox[]> => {
        const { data } = await apiClient.get<ApiResponse<LockerBox[]>>(
            "/lockers/admin/boxes"
        );
        return data.data;
    },

    cancelBooking: async (bookingId: string) => {
        const response = await apiClient.post(
            `/bookings/${bookingId}/cancel`
        );
        return response.data;
    },

    deleteLocker: async (id: string): Promise<void> => {
        await apiClient.patch(`/lockers/oper/boxes/${id}/delete`);
    }
};