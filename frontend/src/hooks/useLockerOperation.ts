import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { devicesApi, type UserDevicePayload } from '../api/devicesApi';

export function useLockerOperation() {
    const qc = useQueryClient();
    const [operationId, setOperationId] = useState<string | null>(null);

    const operationQuery = useQuery({
        queryKey: ['device-operation', operationId],
        queryFn: () => devicesApi.getOperationStatus(operationId!),
        enabled: !!operationId,
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            if (status === 'PENDING' || status === 'PROCESSING') {
                return 1500;
            }
            return false;
        },
    });

    const openLocker = useMutation({
        mutationFn: (payload: UserDevicePayload) => devicesApi.openLockerUser(payload),
        onSuccess: (data) => setOperationId(data.operationId),
        onError: (error) => console.error("Error starting open operation:", error)
    });

    const closeLocker = useMutation({
        mutationFn: (payload: UserDevicePayload) => devicesApi.closeLockerUser(payload),
        onSuccess: (data) => setOperationId(data.operationId),
        onError: (error) => console.error("Error starting close operation:", error)
    });

    const resetOperation = () => {
        setOperationId(null);
        qc.removeQueries({ queryKey: ['device-operation'] });
    };

    const operation = operationQuery.data;
    const isWorking =
        openLocker.isPending ||
        closeLocker.isPending ||
        (operationQuery.isFetching && (operation?.status === 'PENDING' || operation?.status === 'PROCESSING'));

    return {
        openLocker: openLocker.mutateAsync,
        closeLocker: closeLocker.mutateAsync,
        operation,
        isWorking,
        resetOperation
    };
}