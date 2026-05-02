import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { devicesApi, type DeviceOperationData } from '../api/devicesApi';

type Role = 'user' | 'operator';

export function useDeviceOperation(role: Role = 'user') {
    const queryClient = useQueryClient();
    const [operationId, setOperationId] = useState<string | null>(null);
    const [lockerOpenState, setLockerOpenState] = useState(false);
    const processedOpsRef = useRef<Set<string>>(new Set());

    const openFn =
        role === 'operator'
            ? (bookingId: string) =>
                devicesApi.openLockerOperator({ mode: 'SINGLE', lockerBoxIds: [bookingId], reason: 'operator action' })
            : devicesApi.openLockerUser;

    const closeFn =
        role === 'operator' ? devicesApi.closeLockerOperator : devicesApi.closeLockerUser;

    const openMutation = useMutation({
        mutationFn: (bookingId: string) => openFn(bookingId),
        onSuccess: (data) => setOperationId(data.operationId),
    });

    const closeMutation = useMutation({
        mutationFn: (bookingIdOrLockerBoxId: string) => closeFn(bookingIdOrLockerBoxId),
        onSuccess: (data) => setOperationId(data.operationId),
    });

    const cancelMutation = useMutation({
        mutationFn: (bookingId: string) => devicesApi.cancelBooking(bookingId),
        onSuccess: (data) => setOperationId(data.operationId),
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
        select: (data) => {

            if (data.status === 'SUCCESS' && !processedOpsRef.current.has(data.operationId)) {
                processedOpsRef.current.add(data.operationId);

                if (data.type === 'LOCKER_OPEN' || data.type === 'LOCKER_OPEN_BATCH') {
                    setLockerOpenState(true);
                } else if (data.type === 'LOCKER_CLOSE') {
                    setLockerOpenState(false);
                } else if (data.type === 'BOOKING_CANCEL') {
                    queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
                }
            }
            return data;
        },
    });

    const resetOperation = () => {
        setOperationId(null);
    };

    const isWorking =
        openMutation.isPending ||
        closeMutation.isPending ||
        cancelMutation.isPending ||
        (!!operationData && (operationData.status === 'PENDING' || operationData.status === 'PROCESSING'));

    const isCancelling =
        cancelMutation.isPending ||
        (operationData?.type === 'BOOKING_CANCEL' &&
            (operationData.status === 'PENDING' || operationData.status === 'PROCESSING'));

    return {
        openLocker: openMutation.mutateAsync,
        closeLocker: closeMutation.mutateAsync,
        cancelBookingDevice: cancelMutation.mutateAsync,
        resetOperation,
        isWorking,
        isLockerOpen: lockerOpenState,
        isCancelling,
        operationError: operationData?.status === 'FAILED' ? operationData : null,
        error: openMutation.error || closeMutation.error || cancelMutation.error || pollError,
    };
}