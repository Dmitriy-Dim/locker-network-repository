import {apiClient} from './apiClient';

export interface AdminUser {
    userId: string;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    isDeleted?: boolean;
}

export const adminUsersApi = {
    /** GET /api/v1/admin/users */
    getAll: async (): Promise<AdminUser[]> => {
        const { data } = await apiClient.get('/api/v1/admin/users');
        return data?.data ?? data;
    },

    /** GET /api/v1/admin/users/:id */
    getById: async (userId: string): Promise<AdminUser> => {
        const { data } = await apiClient.get(`/api/v1/admin/users/${userId}`);
        return data?.data ?? data;
    },

    /** DELETE /api/v1/admin/users/:id */
    deleteUser: async (userId: string): Promise<AdminUser> => {
        const { data } = await apiClient.delete(`/api/v1/admin/users/${userId}`);
        return data?.data?.result ?? data;
    },

    /** PATCH /api/v1/admin/users/:id/restore */
    restoreUser: async (userId: string): Promise<AdminUser> => {
        const { data } = await apiClient.patch(`/api/v1/admin/users/${userId}/restore`);
        return data?.data?.result ?? data;
    },
};