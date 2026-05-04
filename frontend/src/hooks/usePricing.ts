import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pricingApi, type CreatePricingPayload, type UpdatePricingPayload, type LockerSize } from '../api/pricingApi';

export function usePricing(cityIdFilter?: string, sizeFilter?: LockerSize) {
    const qc = useQueryClient();

    const pricingQuery = useQuery({
        queryKey: ['pricing', cityIdFilter, sizeFilter],
        queryFn: () => pricingApi.getPricing({ cityId: cityIdFilter, size: sizeFilter }),
    });

    const createPrice = useMutation({
        mutationFn: (payload: CreatePricingPayload) => pricingApi.createPricing(payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['pricing'] });
        },
    });

    const updatePrice = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdatePricingPayload }) =>
            pricingApi.updatePricing(id, payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['pricing'] });
        },
    });

    return {
        pricingList: pricingQuery.data || [],
        isLoading: pricingQuery.isLoading,
        isError: pricingQuery.isError,
        error: pricingQuery.error,
        createPrice: createPrice.mutateAsync,
        updatePrice: updatePrice.mutateAsync,
        isMutating: createPrice.isPending || updatePrice.isPending,
    };
}