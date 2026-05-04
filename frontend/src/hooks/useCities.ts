import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { citiesApi, type CityPayload } from '../api/citiesApi';

export function useCities() {
    const qc = useQueryClient();

    const invalidateCities = () => {
        qc.invalidateQueries({ queryKey: ['cities'] });
    };

    const citiesQuery = useQuery({
        queryKey: ['cities'],
        queryFn: citiesApi.getCities,
    });

    const createCity = useMutation({
        mutationFn: (payload: CityPayload) => citiesApi.createCity(payload),
        onSuccess: invalidateCities,
    });

    const updateCity = useMutation({
        mutationFn: citiesApi.updateCity,
        onSuccess: invalidateCities,
    });

    const deleteCity = useMutation({
        mutationFn: (id: string) => citiesApi.deleteCity(id),
        onSuccess: invalidateCities,
    });

    return {
        cities: citiesQuery.data,
        isLoading: citiesQuery.isLoading,
        isError: citiesQuery.isError,
        createCity: createCity.mutateAsync,
        updateCity: updateCity.mutateAsync,
        deleteCity: deleteCity.mutateAsync,
        isMutating: createCity.isPending || updateCity.isPending || deleteCity.isPending
    };
}