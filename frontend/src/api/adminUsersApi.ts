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
    /** GET /admin/users */
    getAll: async (): Promise<AdminUser[]> => {
        const { data } = await apiClient.get('/admin/users');
        return data?.data ?? data;
    },

    /** GET /admin/users/:id */
    getById: async (userId: string): Promise<AdminUser> => {
        const { data } = await apiClient.get(`/admin/users/${userId}`);
        return data?.data ?? data;
    },

    /** DELETE /admin/users/:id */
    deleteUser: async (userId: string): Promise<AdminUser> => {
        const { data } = await apiClient.delete(`/admin/users/${userId}`);
        return data?.data?.result ?? data;
    },

    /** PATCH /admin/users/:id/restore */
    restoreUser: async (userId: string): Promise<AdminUser> => {
        const { data } = await apiClient.patch(`/admin/users/${userId}/restore`);
        return data?.data?.result ?? data;
    },
};