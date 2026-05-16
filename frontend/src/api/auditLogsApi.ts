import { apiClient } from './apiClient';

export interface AuditLogEntry {
    id: string;
    actorId: string;
    lockerId?: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: Record<string, any>;
    createdAt: string;
}

export interface AuditLogMeta {
    limit: number;
    skip: number;
    total: number;
}

export interface AuditLogFilters {
    from?: string;
    to?: string;
    limit?: number;
    skip?: number;
    actorId?: string;
    lockerId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
}

export const auditLogsApi = {
    getAll: async (filters: AuditLogFilters = {}): Promise<{ data: AuditLogEntry[]; meta: AuditLogMeta }> => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== '') {
                params.append(key, String(value));
            }
        });
        const { data } = await apiClient.get(`/admin/audit-logs?${params.toString()}`);
        return { data: data?.data ?? [], meta: data?.meta ?? { limit: 50, skip: 0, total: 0 } };
    },
};