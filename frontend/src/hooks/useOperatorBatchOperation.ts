import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { devicesApi } from '../api/devicesApi';

interface BatchPayload {
    stationId?: string;
    mode: 'ALL' | 'STATUS' | 'IDS';
    status?: string;
    lockerBoxIds?: string[];
    reason: string;
}

export function useOperatorBatchOperation() {
    const qc = useQueryClient();
    const [operationId, setOperationId] = useState<string | null>(null);

    const operationQuery = useQuery({
        queryKey: ['operator-batch-operation', operationId],
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

    const openBatch = useMutation({
        mutationFn: (payload: BatchPayload) => devicesApi.openLockerOperator(payload),
        onSuccess: (data) => setOperationId(data.operationId),
        onError: (error) => console.error("Ошибка старта batch-операции:", error)
    });

    const resetOperation = () => {
        setOperationId(null);
        qc.removeQueries({ queryKey: ['operator-batch-operation'] });
    };

    const operation = operationQuery.data;
    const isWorking =
        openBatch.isPending ||
        (operationQuery.isFetching && (operation?.status === 'PENDING' || operation?.status === 'PROCESSING'));

    return {
        openBatch: openBatch.mutateAsync,
        operation,
        isWorking,
        resetOperation
    };
}