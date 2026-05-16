import { useQuery } from '@tanstack/react-query';
import { auditLogsApi, type AuditLogFilters } from '../api/auditLogsApi';

export function useAuditLogs(filters: AuditLogFilters = {}) {
    const query = useQuery({
        queryKey: ['admin-audit-logs', filters],
        queryFn: () => auditLogsApi.getAll(filters),
    });

    return {
        logs: query.data?.data ?? [],
        meta: query.data?.meta ?? { limit: 50, skip: 0, total: 0 },
        isLoading: query.isLoading,
        isError: query.isError,
        refetch: query.refetch,
    };
}