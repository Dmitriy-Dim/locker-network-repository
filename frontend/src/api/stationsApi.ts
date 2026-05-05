import { apiClient } from "./apiClient";
import type { LockerStation, StationStatus } from "../types/index";

export interface ApiResponse<T> {
    success: boolean;
    correlationId?: string;
    data: T;
    meta?: any;
}

export const stationsApi = {

    // ===============================
    // ADMIN
    // ===============================

    getAllStations: async (limit?: number): Promise<LockerStation[]> => {
        const { data } = await apiClient.get<ApiResponse<LockerStation[]>>(
            "/lockers/admin/stations",
            { params: { limit } }
        );
        return data.data;
    },

    getAdminStationById: async (id: string): Promise<LockerStation> => {
        const { data } = await apiClient.get<ApiResponse<LockerStation>>(
            `/lockers/admin/stations/${id}`
        );
        return data.data;
    },

    createStation: async (payload: {
        city: string;
        address: string;
        latitude: number;
        longitude: number;
    }): Promise<LockerStation> => {
        const { data } = await apiClient.post<ApiResponse<LockerStation>>(
            "/lockers/admin/stations",
            payload
        );
        return data.data;
    },

    updateStationStatusAdmin: async (
        id: string,
        status: Extract<StationStatus, "ACTIVE" | "MAINTENANCE">
    ): Promise<LockerStation> => {
        const { data } = await apiClient.patch<ApiResponse<LockerStation>>(
            `/lockers/admin/stations/${id}/status`,
            { status }
        );
        return data.data;
    },

    // ===============================
    // OPERATOR
    // ===============================

    getOperatorStations: async (limit?: number): Promise<LockerStation[]> => {
        const { data } = await apiClient.get<ApiResponse<LockerStation[]>>(
            "/lockers/oper/stations",
            { params: { limit } }
        );
        return data.data;
    },

    getOperatorStationById: async (id: string): Promise<LockerStation> => {
        const { data } = await apiClient.get<ApiResponse<LockerStation>>(
            `/lockers/oper/stations/${id}`
        );
        return data.data;
    },

    updateStationStatusOperator: async (
        id: string,
        status: "ACTIVE" | "MAINTENANCE"
    ): Promise<LockerStation> => {
        const { data } = await apiClient.patch<ApiResponse<LockerStation>>(
            `/lockers/oper/stations/${id}/status`,
            { status }
        );
        return data.data;
    },

    deleteStation: async (id: string): Promise<void> => {
        await apiClient.patch(`/lockers/oper/stations/${id}/delete`);
    },

    // ===============================
    // PUBLIC
    // ===============================

    getActiveStations: async (limit?: number): Promise<LockerStation[]> => {
        const { data } = await apiClient.get<ApiResponse<LockerStation[]>>(
            "/lockers/stations",
            {
                params: {
                    status: "ACTIVE",
                    limit
                }
            }
        );
        return data.data;
    },

    getStationById: async (id: string): Promise<LockerStation> => {
        const { data } = await apiClient.get<ApiResponse<LockerStation>>(
            `/lockers/stations/${id}`
        );
        return data.data;
    },

    // ===============================
    // LOCKERS
    // ===============================

    addLocker: async (payload: {
        stationId: string;
        code: string;
        size: "S" | "M" | "L";
    }): Promise<any> => {
        const { data } = await apiClient.post<ApiResponse<any>>(
            `/lockers/admin/boxes`,
            payload
        );
        return data.data;
    }
};