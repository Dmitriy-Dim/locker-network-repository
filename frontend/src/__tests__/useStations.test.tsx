import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import {useAuth} from "../hooks/useAuth.js";
import {stationsApi} from "../api/stationsApi.js";
import {useStations} from "../hooks/useStations.js";


jest.mock('../api/stationsApi', () => ({
    stationsApi: {
        getActiveStations: jest.fn(),
        getAllStations: jest.fn(),
        getOperatorStations: jest.fn(),
        createStation: jest.fn(),
        deleteStation: jest.fn(),
        updateStationStatusAdmin: jest.fn(),
        updateStationStatusOperator: jest.fn(),
    },
}));

jest.mock('../hooks/useAuth', () => ({
    useAuth: jest.fn(),
}));


const mockStationsApi = stationsApi as jest.Mocked<typeof stationsApi>;
const mockUseAuth = useAuth as jest.Mock;

const STATION_MOCK = {
    stationId: 'st_001',
    cityId: 'city_001',
    address: 'HaNamal 12',
    latitude: 32.821,
    longitude: 34.998,
    status: 'ACTIVE' as const,
    version: 1,
    city: { code: 'HFA', name: 'Haifa' },
    lockers: [],
};

function makeWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

describe('useStations — public mode', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUseAuth.mockReturnValue({ user: null });
        mockStationsApi.getActiveStations.mockResolvedValue([STATION_MOCK]);
    });

    it('fetches active stations when publicOnly=true', async () => {
        const { result } = renderHook(() => useStations({ publicOnly: true }), {
            wrapper: makeWrapper(),
        });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.stations).toHaveLength(1);
        expect(result.current.stations[0].stationId).toBe('st_001');
        expect(mockStationsApi.getActiveStations).toHaveBeenCalledTimes(1);
    });
});

describe('useStations — admin role', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUseAuth.mockReturnValue({ user: { role: 'ADMIN' } });
        mockStationsApi.getAllStations.mockResolvedValue([STATION_MOCK]);
    });

    it('uses getAllStations for ADMIN role', async () => {
        const { result } = renderHook(() => useStations(), {
            wrapper: makeWrapper(),
        });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(mockStationsApi.getAllStations).toHaveBeenCalledTimes(1);
        expect(mockStationsApi.getOperatorStations).not.toHaveBeenCalled();
    });
});

describe('useStations — operator role', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUseAuth.mockReturnValue({ user: { role: 'OPERATOR' } });
        mockStationsApi.getOperatorStations.mockResolvedValue([STATION_MOCK]);
    });

    it('uses getOperatorStations for OPERATOR role', async () => {
        const { result } = renderHook(() => useStations(), {
            wrapper: makeWrapper(),
        });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(mockStationsApi.getOperatorStations).toHaveBeenCalledTimes(1);
        expect(mockStationsApi.getAllStations).not.toHaveBeenCalled();
    });
});

describe('useStations — createStation mutation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUseAuth.mockReturnValue({ user: { role: 'ADMIN' } });
        mockStationsApi.getAllStations.mockResolvedValue([STATION_MOCK]);
    });

    it('calls stationsApi.createStation with correct payload', async () => {
        const newStation = { ...STATION_MOCK, stationId: 'st_002' };
        mockStationsApi.createStation.mockResolvedValueOnce(newStation);
        mockStationsApi.getAllStations.mockResolvedValue([STATION_MOCK, newStation]);

        const { result } = renderHook(() => useStations(), {
            wrapper: makeWrapper(),
        });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        const payload = {
            city: 'HFA',
            address: 'HaYam 5',
            latitude: 32.82,
            longitude: 34.99,
        };

        await act(async () => {
            await result.current.createStation(payload);
        });

        expect(mockStationsApi.createStation).toHaveBeenCalledWith(payload);
    });
});
