import { apiClient } from "./apiClient";
import type { SecurityAlert } from "../types/alerts/alerts";

interface ApiResponse<T> {
    success: boolean;
    status: string;
    correlationId: string;
    data: T;
}

export const getAdminSecurityAlerts = async (): Promise<SecurityAlert[]> => {
    const response = await apiClient.get<ApiResponse<SecurityAlert[]>>(
        "/admin/security-alerts/cloudwatch"
    );

    return response.data.data;
};

export const getOperatorSecurityAlerts = async (): Promise<SecurityAlert[]> => {
    const response = await apiClient.get<ApiResponse<SecurityAlert[]>>(
        "/operator/security-alerts/cloudwatch"
    );

    return response.data.data;
};