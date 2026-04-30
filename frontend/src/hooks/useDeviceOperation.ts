import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { devicesApi, type DeviceOperationData } from '../api/devicesApi';

export function useDeviceOperation() {
    const queryClient = useQueryClient();
    const [operationId, setOperationId] = useState<string | null>(null);
    const [isLockerOpen, setIsLockerOpen] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const lastProcessedOpRef = useRef<string | null>(null);

    const openMutation = useMutation({
        mutationFn: (bookingId: string) => devicesApi.openLocker(bookingId),
        onSuccess: (data) => setOperationId(data.operationId),
    });

    const closeMutation = useMutation({
        mutationFn: (bookingId: string) => devicesApi.closeLocker(bookingId),
        onSuccess: (data) => setOperationId(data.operationId),
    });

    const cancelMutation = useMutation({
        mutationFn: (bookingId: string) => devicesApi.cancelBooking(bookingId),
        onSuccess: (data) => {
            setOperationId(data.operationId);
            setIsCancelling(true);
        },
    });

    const { data: operationData, error: pollError } = useQuery<DeviceOperationData>({
        queryKey: ['device-operation', operationId],
        queryFn: () => devicesApi.getOperationStatus(operationId!),
        enabled: !!operationId,
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            if (status === 'SUCCESS' || status === 'FAILED') return false;
            return 2000;
        },
    });

    useEffect(() => {
        if (operationData?.status !== 'SUCCESS') return;
        if (operationData.operationId === lastProcessedOpRef.current) return;
        lastProcessedOpRef.current = operationData.operationId;
        /* eslint-disable react-hooks/set-state-in-effect */
        if (operationData.type === 'LOCKER_OPEN') setIsLockerOpen(true);
        if (operationData.type === 'LOCKER_CLOSE') setIsLockerOpen(false);
        if (operationData.type === 'BOOKING_CANCEL') {
            setIsCancelling(false);
            queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
        }
        /* eslint-enable react-hooks/set-state-in-effect */
    }, [operationData?.status, operationData?.operationId, operationData?.type, queryClient]);

    const resetOperation = () => {
        setOperationId(null);
        lastProcessedOpRef.current = null;
    };

    const isWorking =
        openMutation.isPending ||
        closeMutation.isPending ||
        cancelMutation.isPending ||
        (!!operationData && (operationData.status === 'PENDING' || operationData.status === 'PROCESSING'));

    return {
        openLocker: openMutation.mutateAsync,
        closeLocker: closeMutation.mutateAsync,
        cancelBookingDevice: cancelMutation.mutateAsync,
        resetOperation,
        isWorking,
        isLockerOpen,
        isCancelling,
        operationError: operationData?.status === 'FAILED' ? operationData : null,
        error: openMutation.error || closeMutation.error || cancelMutation.error || pollError,
    };
}