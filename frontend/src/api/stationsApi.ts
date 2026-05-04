import { apiClient } from "./apiClient";
import type { LockerStation } from "../types/index";

export interface ApiResponse<T> {
    success: boolean;
    correlationId?: string;
    data: T;
    meta?: any;
}

export const stationsApi = {

    // ===============================
    // ADMIN (ONLY CREATE / READ)
    // ===============================

    getAllStations: async (): Promise<LockerStation[]> => {
        const { data } = await apiClient.get<ApiResponse<LockerStation[]>>(
            "/lockers/admin/stations"
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

    // ===============================
    // OPERATOR (STATUS MANAGEMENT)
    // ===============================

    getOperatorStations: async (): Promise<LockerStation[]> => {
        const { data } = await apiClient.get<ApiResponse<LockerStation[]>>(
            "/lockers/oper/stations"
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

    getActiveStations: async (): Promise<LockerStation[]> => {
        const { data } = await apiClient.get<ApiResponse<LockerStation[]>>(
            "/lockers/stations",
            {
                params: { status: "ACTIVE" }
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
    // LOCKERS (ADMIN ONLY CREATE)
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