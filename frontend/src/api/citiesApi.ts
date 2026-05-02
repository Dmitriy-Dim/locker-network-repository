import { apiClient } from './apiClient';

export interface CityPayload {
    code: string;
    name: string;
}

export interface City extends CityPayload {
    id: string;
}

export const citiesApi = {
    getCities: async (): Promise<City[]> => {
        const { data } = await apiClient.get('/cities/');
        return data.data || data;
    },

    createCity: async (payload: CityPayload) => {
        const { data } = await apiClient.post('/cities/', payload);
        return data.data || data;
    },

    updateCity: async ({ id, payload }: { id: string; payload: CityPayload }) => {
        const { data } = await apiClient.patch(`/cities/${id}`, payload);
        return data.data || data;
    },

    deleteCity: async (id: string) => {
        const { data } = await apiClient.delete(`/cities/${id}`);
        return data.data || data;
    }
};