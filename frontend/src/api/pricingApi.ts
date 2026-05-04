import { apiClient } from './apiClient';
import type { City } from './citiesApi';

export type LockerSize = "S" | "M" | "L";

export interface Pricing {
    priceId: string;
    cityId: string;
    size: LockerSize;
    pricePerHour: number;
    createdAt?: string;
    updatedAt?: string;
    city?: Partial<City>;
}

export interface CreatePricingPayload {
    cityId: string;
    size: LockerSize;
    pricePerHour: number;
}

export interface UpdatePricingPayload {
    pricePerHour: number;
}

export interface PricingResponse<T> {
    success: boolean;
    status: string;
    data: T;
    meta?: any;
}

export const pricingApi = {
    getPricing: async (filters?: { cityId?: string; size?: LockerSize }): Promise<Pricing[]> => {
        const { data } = await apiClient.get('/pricing', { params: filters });
        return data.data || data;
    },

    createPricing: async (payload: CreatePricingPayload): Promise<{ id: string }> => {
        const { data } = await apiClient.post<PricingResponse<{ id: string }>>('/pricing', payload);
        return data.data;
    },
    
    updatePricing: async (priceId: string, payload: UpdatePricingPayload): Promise<{ newPrice: Pricing }> => {
        const { data } = await apiClient.patch<PricingResponse<{ newPrice: Pricing }>>(`/pricing/${priceId}`, payload);
        return data.data;
    }
};