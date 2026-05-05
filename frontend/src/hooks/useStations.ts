import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { stationsApi } from "../api/stationsApi";
import type { LockerStation, StationStatus } from "../types/index";

type OperatorStationStatus = Extract<StationStatus, "ACTIVE" | "MAINTENANCE">;

export function useStations(options?: { publicOnly?: boolean; limit?: number }) {
    const qc = useQueryClient();
    const isPublic = options?.publicOnly;
    const limit = options?.limit;

    // ===============================
    // QUERIES
    // ===============================

    const query = useQuery<LockerStation[]>({
        queryKey: ["stations", isPublic ? "active" : "all", limit],
        queryFn: async () => {
            return isPublic
                ? await stationsApi.getActiveStations(limit)
                : await stationsApi.getAllStations(limit);
        },
    });

    const operatorQuery = useQuery<LockerStation[]>({
        queryKey: ["operator-stations", limit],
        queryFn: async () => {
            return await stationsApi.getOperatorStations(limit);
        },
    });

    const invalidateAll = async () => {
        await Promise.all([
            qc.invalidateQueries({ queryKey: ["stations"] }),
            qc.invalidateQueries({ queryKey: ["operator-stations"] }),
            qc.invalidateQueries({ queryKey: ["operator-station"] }),
        ]);
    };

    // ===============================
    // ADMIN
    // ===============================

    const create = useMutation({
        mutationFn: stationsApi.createStation,
        onSuccess: invalidateAll,
    });

    const remove = useMutation({
        mutationFn: stationsApi.deleteStation,
        onSuccess: invalidateAll,
    });

    // ===============================
    // OPERATOR
    // ===============================

    const changeStatusOperator = useMutation({
        mutationFn: ({ id, status }: { id: string; status: OperatorStationStatus }) =>
            stationsApi.updateStationStatusOperator(id, status),
        onSuccess: invalidateAll,
    });

    return {
        stations: query.data ?? [],
        operatorStations: operatorQuery.data ?? [],

        isLoading: query.isLoading || operatorQuery.isLoading,
        error: query.error || operatorQuery.error,

        createStation: create.mutateAsync,
        deleteStation: remove.mutateAsync,

        changeStationStatusOperator: changeStatusOperator.mutateAsync,

        refresh: invalidateAll,
    };
}