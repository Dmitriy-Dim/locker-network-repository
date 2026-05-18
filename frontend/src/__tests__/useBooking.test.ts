import { renderHook, act } from '@testing-library/react';
import { savePaymentUrl, getPaymentUrl, removePaymentUrl, useBooking } from '../hooks/useBooking';

// ─── localStorage helpers ────────────────────────────────────────────────────

describe('savePaymentUrl / getPaymentUrl / removePaymentUrl', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('saves and retrieves a payment URL for a booking', () => {
        savePaymentUrl('bk_001', 'https://pay.example.com/session_1');
        expect(getPaymentUrl('bk_001')).toBe('https://pay.example.com/session_1');
    });

    it('returns null for an unknown bookingId', () => {
        expect(getPaymentUrl('unknown_booking')).toBeNull();
    });

    it('removes a payment URL', () => {
        savePaymentUrl('bk_002', 'https://pay.example.com/session_2');
        removePaymentUrl('bk_002');
        expect(getPaymentUrl('bk_002')).toBeNull();
    });

    it('does not affect other bookings when removing one', () => {
        savePaymentUrl('bk_003', 'https://pay.example.com/session_3');
        savePaymentUrl('bk_004', 'https://pay.example.com/session_4');
        removePaymentUrl('bk_003');
        expect(getPaymentUrl('bk_004')).toBe('https://pay.example.com/session_4');
    });

    it('overwrites an existing URL for the same bookingId', () => {
        savePaymentUrl('bk_005', 'https://old.example.com');
        savePaymentUrl('bk_005', 'https://new.example.com');
        expect(getPaymentUrl('bk_005')).toBe('https://new.example.com');
    });
});

// ─── useBooking hook ─────────────────────────────────────────────────────────

// We mock apiClient so no real HTTP calls go out
jest.mock('../api/apiClient', () => ({
    apiClient: {
        post: jest.fn(),
        get: jest.fn(),
    },
}));

import { apiClient } from '../api/apiClient';
const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('useBooking — startBookingFlow', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
        // Suppress window.location.href assignments in jsdom
        Object.defineProperty(window, 'location', {
            value: { href: '' },
            writable: true,
        });
    });

    it('starts with isLoading=false and no error', () => {
        const { result } = renderHook(() => useBooking());
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('sets isLoading=true while booking is being created', async () => {
        // /bookings/init returns operationId, then polling never resolves (we just check loading)
        (mockApiClient.post as jest.Mock).mockResolvedValueOnce({
            data: { data: { operationId: 'op_001' } },
        });
        // Polling hangs — we only care about the loading state
        (mockApiClient.get as jest.Mock).mockReturnValue(new Promise(() => {}));

        const { result } = renderHook(() => useBooking());

        act(() => {
            result.current.startBookingFlow({
                stationId: 'st_1',
                size: 'M',
                expectedEndTime: new Date(Date.now() + 3600_000).toISOString(),
            });
        });

        expect(result.current.isLoading).toBe(true);
    });

    it('sets error when /bookings/init call fails', async () => {
        (mockApiClient.post as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));

        const { result } = renderHook(() => useBooking());

        await act(async () => {
            await result.current.startBookingFlow({
                stationId: 'st_1',
                size: 'M',
                expectedEndTime: new Date(Date.now() + 3600_000).toISOString(),
            });
        });

        expect(result.current.error).toBe('Network Error');
        expect(result.current.isLoading).toBe(false);
    });

    it('sets error when operationId is missing from response', async () => {
        (mockApiClient.post as jest.Mock).mockResolvedValueOnce({ data: {} });

        const { result } = renderHook(() => useBooking());

        await act(async () => {
            await result.current.startBookingFlow({
                stationId: 'st_1',
                size: 'M',
                expectedEndTime: new Date(Date.now() + 3600_000).toISOString(),
            });
        });

        expect(result.current.error).toBe('No operationId received');
    });

    it('redirects to paymentUrl on successful booking', async () => {
        const paymentUrl = 'https://stripe.example.com/checkout';
        (mockApiClient.post as jest.Mock).mockResolvedValueOnce({
            data: { data: { operationId: 'op_002' } },
        });
        // Polling resolves immediately with SUCCESS
        (mockApiClient.get as jest.Mock).mockResolvedValue({
            data: {
                data: {
                    type: 'BOOKING_INIT',
                    status: 'SUCCESS',
                    bookingId: 'bk_100',
                    payment: { paymentUrl },
                },
            },
        });

        const { result } = renderHook(() => useBooking());

        await act(async () => {
            await result.current.startBookingFlow({
                stationId: 'st_1',
                size: 'L',
                expectedEndTime: new Date(Date.now() + 3600_000).toISOString(),
            });
        });

        expect(window.location.href).toBe(paymentUrl);
        expect(getPaymentUrl('bk_100')).toBe(paymentUrl);
    });
});
