import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { devicesApi, type DeviceOperationData } from '../api/devicesApi';

export interface BatchPayload {
    stationId: string;
    mode: 'ALL' | 'STATUS' | 'IDS';
    status?: string;
    lockerBoxIds?: string[];
    reason: string;
}

const isTerminal = (s?: string) =>
    s === 'SUCCESS' || s === 'FAILED' || s === 'EXPIRED';

export function useOperatorBatchOperation() {
    const qc = useQueryClient();
    const [openOperationId, setOpenOperationId] = useState<string | null>(null);
    const [closeOperationId, setCloseOperationId] = useState<string | null>(null);

    // ── polling OPEN ──────────────────────────────────────────────────────────
    const openOperationQuery = useQuery({
        queryKey: ['operator-open-operation', openOperationId],
        queryFn: () => devicesApi.getOperationStatus(openOperationId!),
        enabled: !!openOperationId,
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            return isTerminal(status) ? false : 1500;
        },
    });

    const openOperation = openOperationQuery.data ?? null;
    const openSettled = isTerminal(openOperation?.status);

    // ── polling CLOSE ─────────
    const closeOperationQuery = useQuery({
        queryKey: ['operator-close-operation', closeOperationId],
        queryFn: () => devicesApi.getOperationStatus(closeOperationId!),
        enabled: !!closeOperationId && (!openOperationId || openSettled),
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            return isTerminal(status) ? false : 1500;
        },
    });

    // ── mutations ─────────────────────────────────────────────────────────────
    const openBatchMutation = useMutation<DeviceOperationData, Error, BatchPayload>({
        mutationFn: (payload: BatchPayload) => devicesApi.openLockerOperator(payload),
        onSuccess: (data) => setOpenOperationId(data.operationId),
        onError: (error) => console.error('Batch open error:', error),
    });

    const closeBatchMutation = useMutation<DeviceOperationData, Error, BatchPayload>({
        mutationFn: (payload: BatchPayload) => devicesApi.closeLockerOperator(payload),
        onSuccess: (data) => setCloseOperationId(data.operationId),
        onError: (error) => console.error('Batch close error:', error),
    });

    // ── derived state ─────────────────────────────────────────────────────────
    const closeOperation = closeOperationQuery.data ?? null;
    const closeSettled = isTerminal(closeOperation?.status);

    const isOpenPending =
        openBatchMutation.isPending ||
        (!!openOperationId && !openSettled);

    const isClosePending =
        closeBatchMutation.isPending ||
        (!!closeOperationId && !closeSettled);

    const openSucceeded = openOperation?.status === 'SUCCESS' && (openOperation?.openedCount ?? 0) > 0;
    const openFailed = openSettled && openOperation?.status !== 'SUCCESS';

    const closeSucceeded = closeOperation?.status === 'SUCCESS';
    const closeFailed = closeSettled && closeOperation?.status !== 'SUCCESS';

    // ── reset ─────────────────────────────────────────────────────────────────
    const resetOperation = () => {
        setOpenOperationId(null);
        setCloseOperationId(null);
        qc.removeQueries({ queryKey: ['operator-open-operation'] });
        qc.removeQueries({ queryKey: ['operator-close-operation'] });
    };

    return {
        // actions
        openBatch: openBatchMutation.mutateAsync,
        closeBatch: closeBatchMutation.mutateAsync,
        resetOperation,
        // open state
        openOperation,
        isOpenPending,
        openSucceeded,
        openFailed,
        openError: openBatchMutation.error,
        // close state
        closeOperation,
        isClosePending,
        closeSucceeded,
        closeFailed,
        closeError: closeBatchMutation.error,
        // combined
        isWorking: isOpenPending || isClosePending,
    };
}