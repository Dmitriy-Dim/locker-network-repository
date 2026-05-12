import { useRef, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { devicesApi, type DeviceOperationData, type UserDevicePayload } from '../api/devicesApi';

type Role = 'user' | 'operator';

export function useDeviceOperation(role: Role = 'user') {
    const queryClient = useQueryClient();
    const [operationId, setOperationId] = useState<string | null>(null);
    const [lockerOpenState, setLockerOpenState] = useState(false);
    const processedOpsRef = useRef<Set<string>>(new Set());


    const openFn =
        role === 'operator'
            ? (params: UserDevicePayload) =>
                devicesApi.openLockerOperator({ mode: 'SINGLE', lockerBoxIds: [params.lockerBoxId], reason: 'operator action' })
            : devicesApi.openLockerUser;

    const closeFn =
        role === 'operator'
            ? (params: UserDevicePayload) => devicesApi.closeLockerOperator(params.lockerBoxId)
            : devicesApi.closeLockerUser;

    const openMutation = useMutation({
        mutationFn: (params: UserDevicePayload) => openFn(params),
        onSuccess: (data) => setOperationId(data.operationId),
    });

    const closeMutation = useMutation({
        mutationFn: (params: UserDevicePayload) => closeFn(params),
        onSuccess: (data) => setOperationId(data.operationId),
    });

    const cancelMutation = useMutation({
        mutationFn: (bookingId: string) => devicesApi.cancelBooking(bookingId),
        onSuccess: (data) => setOperationId(data.operationId),
    });
    const extendMutation = useMutation({
        mutationFn: ({ bookingId, endTime }: { bookingId: string, endTime: string }) =>
            devicesApi.extendBooking(bookingId, endTime),
        onSuccess: (data) => setOperationId(data.operationId),
    });


    const { data: operationData, error: pollError } = useQuery<DeviceOperationData>({
        queryKey: ['device-operation', operationId],
        queryFn: () => devicesApi.getOperationStatus(operationId!),
        enabled: !!operationId,
        refetchInterval: (query: any) => {
            const data = query?.state?.data || query;
            const status = data?.status;
            if (status === 'SUCCESS' || status === 'FAILED') return false;
            return 1500;
        },
    });


    useEffect(() => {
        if (operationData?.status === 'SUCCESS' && !processedOpsRef.current.has(operationData.operationId)) {
            processedOpsRef.current.add(operationData.operationId);
            if (operationData.payment?.paymentUrl) {
                window.location.href = operationData.payment.paymentUrl;
                return;
            }
            if (operationData.type === 'LOCKER_OPEN' || operationData.type === 'LOCKER_OPEN_BATCH') {
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setLockerOpenState(true);
            } else if (operationData.type === 'LOCKER_CLOSE') {
                setLockerOpenState(false);
            } else if (operationData.type === 'BOOKING_CANCEL') {
                queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
            }
        }
    }, [operationData, queryClient]);

    const resetOperation = () => {
        setOperationId(null);
    };

    const isQueryStarting = !!operationId && !operationData;

    const isWorking =
        openMutation.isPending ||
        closeMutation.isPending ||
        cancelMutation.isPending ||
        extendMutation.isPending ||
        isQueryStarting ||
        (!!operationData && (operationData.status === 'PENDING' || operationData.status === 'PROCESSING'));

    const isCancelling =
        cancelMutation.isPending ||
        (operationData?.type === 'BOOKING_CANCEL' &&
            (isQueryStarting || operationData.status === 'PENDING' || operationData.status === 'PROCESSING'));

    return {
        openLocker: openMutation.mutateAsync,
        closeLocker: closeMutation.mutateAsync,
        cancelBookingDevice: cancelMutation.mutateAsync,
        extendBooking: extendMutation.mutateAsync,
        resetOperation,
        isWorking,
        isLockerOpen: lockerOpenState,
        isCancelling,
        operationError: operationData?.status === 'FAILED' ? operationData : null,
        error: openMutation.error || closeMutation.error || cancelMutation.error || pollError,
    };
}