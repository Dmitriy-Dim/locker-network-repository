import { useQuery } from '@tanstack/react-query';
import { bookingsApi } from '../api/bookingsApi';

export function useMyBookings() {
    return useQuery({
        queryKey: ['my-bookings'],
        queryFn: bookingsApi.getMyBookings,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
    });
}