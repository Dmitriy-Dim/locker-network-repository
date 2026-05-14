import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminUsersApi } from '../api/adminUsersApi';

export function useAdminUsers() {
    const qc = useQueryClient();

    const listQuery = useQuery({
        queryKey: ['admin-users'],
        queryFn: () => adminUsersApi.getAll(),
    });

    const deleteUser = useMutation({
        mutationFn: (userId: string) => adminUsersApi.deleteUser(userId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
    });

    const restoreUser = useMutation({
        mutationFn: (userId: string) => adminUsersApi.restoreUser(userId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
    });

    return {
        users: listQuery.data ?? [],
        isLoading: listQuery.isLoading,
        isError: listQuery.isError,
        deleteUser: deleteUser.mutateAsync,
        restoreUser: restoreUser.mutateAsync,
        isDeleting: deleteUser.isPending,
        isRestoring: restoreUser.isPending,
    };
}