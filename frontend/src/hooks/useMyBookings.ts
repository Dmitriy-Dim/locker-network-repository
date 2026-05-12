import { useQuery } from '@tanstack/react-query';
import { bookingsApi } from '../api/bookingsApi';

export function useMyBookings() {
    return useQuery({
        queryKey: ['my-bookings'],
        queryFn: bookingsApi.getMyBookings,
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
    });
}