import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { useDeviceOperation } from '../hooks/useDeviceOperation';

jest.mock('../api/devicesApi', () => ({
    devicesApi: {
        openLockerUser: jest.fn(),
        closeLockerUser: jest.fn(),
        openLockerOperator: jest.fn(),
        closeLockerOperator: jest.fn(),
        cancelBooking: jest.fn(),
        extendBooking: jest.fn(),
        getOperationStatus: jest.fn(),
    },
}));

import { devicesApi } from '../api/devicesApi';
const mockDevicesApi = devicesApi as jest.Mocked<typeof devicesApi>;

function makeWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const PAYLOAD = {
    bookingId: 'bk_001',
    stationId: 'st_001',
    lockerBoxId: 'lk_001',
};

describe('useDeviceOperation — user role', () => {
    beforeEach(() => jest.clearAllMocks());

    it('initial state: isWorking=false, isLockerOpen=false, no error', () => {
        const { result } = renderHook(() => useDeviceOperation('user'), {
            wrapper: makeWrapper(),
        });
        expect(result.current.isWorking).toBe(false);
        expect(result.current.isLockerOpen).toBe(false);
        expect(result.current.error).toBeNull();
        expect(result.current.operationError).toBeNull();
    });

    it('openLocker starts polling after mutation succeeds', async () => {
        mockDevicesApi.openLockerUser.mockResolvedValueOnce({
            operationId: 'op_open_001',
            type: 'LOCKER_OPEN',
            status: 'PENDING',
        });
        mockDevicesApi.getOperationStatus.mockResolvedValue({
            operationId: 'op_open_001',
            type: 'LOCKER_OPEN',
            status: 'PROCESSING',
        });

        const { result } = renderHook(() => useDeviceOperation('user'), {
            wrapper: makeWrapper(),
        });

        act(() => {
            result.current.openLocker(PAYLOAD);
        });

        await waitFor(() =>
            expect(mockDevicesApi.openLockerUser).toHaveBeenCalledWith(PAYLOAD)
        );
    });

    it('sets isLockerOpen=true when LOCKER_OPEN succeeds', async () => {
        mockDevicesApi.openLockerUser.mockResolvedValueOnce({
            operationId: 'op_open_002',
            type: 'LOCKER_OPEN',
            status: 'PENDING',
        });
        mockDevicesApi.getOperationStatus.mockResolvedValueOnce({
            operationId: 'op_open_002',
            type: 'LOCKER_OPEN',
            status: 'SUCCESS',
            lockStatus: 'UNLOCKED',
            doorStatus: 'OPEN',
        });

        const { result } = renderHook(() => useDeviceOperation('user'), {
            wrapper: makeWrapper(),
        });

        await act(async () => {
            await result.current.openLocker(PAYLOAD);
        });

        await waitFor(() => expect(result.current.isLockerOpen).toBe(true));
    });

    it('closeLocker sets isLockerOpen=false when LOCKER_CLOSE succeeds', async () => {
        mockDevicesApi.closeLockerUser.mockResolvedValueOnce({
            operationId: 'op_close_001',
            type: 'LOCKER_CLOSE',
            status: 'PENDING',
        });
        mockDevicesApi.getOperationStatus.mockResolvedValueOnce({
            operationId: 'op_close_001',
            type: 'LOCKER_CLOSE',
            status: 'SUCCESS',
            lockStatus: 'LOCKED',
            doorStatus: 'CLOSED',
        });

        const { result } = renderHook(() => useDeviceOperation('user'), {
            wrapper: makeWrapper(),
        });

        await act(async () => {
            await result.current.closeLocker(PAYLOAD);
        });

        await waitFor(() => expect(result.current.isLockerOpen).toBe(false));
    });

    it('operationError is set when operation FAILED', async () => {
        const failedOp = {
            operationId: 'op_open_003',
            type: 'LOCKER_OPEN' as const,
            status: 'FAILED' as const,
            errorCode: 'OPEN_ATTEMPTS_EXHAUSTED',
            errorMessage: 'Locker failed to open after 3 attempts',
        };

        mockDevicesApi.openLockerUser.mockResolvedValueOnce({
            operationId: 'op_open_003',
            type: 'LOCKER_OPEN',
            status: 'PENDING',
        });
        mockDevicesApi.getOperationStatus.mockResolvedValueOnce(failedOp);

        const { result } = renderHook(() => useDeviceOperation('user'), {
            wrapper: makeWrapper(),
        });

        await act(async () => {
            await result.current.openLocker(PAYLOAD);
        });

        await waitFor(() =>
            expect(result.current.operationError).toMatchObject({
                status: 'FAILED',
                errorCode: 'OPEN_ATTEMPTS_EXHAUSTED',
            })
        );
    });

    it('resetOperation clears operationId', async () => {
        mockDevicesApi.openLockerUser.mockResolvedValueOnce({
            operationId: 'op_reset_001',
            type: 'LOCKER_OPEN',
            status: 'PENDING',
        });
        mockDevicesApi.getOperationStatus.mockResolvedValue({
            operationId: 'op_reset_001',
            type: 'LOCKER_OPEN',
            status: 'PENDING',
        });

        const { result } = renderHook(() => useDeviceOperation('user'), {
            wrapper: makeWrapper(),
        });

        await act(async () => {
            await result.current.openLocker(PAYLOAD);
        });

        act(() => {
            result.current.resetOperation();
        });

        expect(result.current.operationError).toBeNull();
    });
});

describe('useDeviceOperation — operator role', () => {
    beforeEach(() => jest.clearAllMocks());

    it('uses openLockerOperator instead of openLockerUser', async () => {
        mockDevicesApi.openLockerOperator.mockResolvedValueOnce({
            operationId: 'op_oper_001',
            type: 'LOCKER_OPEN_BATCH',
            status: 'PENDING',
        });
        mockDevicesApi.getOperationStatus.mockResolvedValue({
            operationId: 'op_oper_001',
            type: 'LOCKER_OPEN_BATCH',
            status: 'PROCESSING',
        });

        const { result } = renderHook(() => useDeviceOperation('operator'), {
            wrapper: makeWrapper(),
        });

        await act(async () => {
            await result.current.openLocker(PAYLOAD);
        });

        expect(mockDevicesApi.openLockerOperator).toHaveBeenCalled();
        expect(mockDevicesApi.openLockerUser).not.toHaveBeenCalled();
    });
});
