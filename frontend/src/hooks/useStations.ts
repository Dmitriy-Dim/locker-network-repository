import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { stationsApi } from "../api/stationsApi";
import type { LockerStation, StationStatus } from "../types/index";

// 🔒 оператор НЕ может ставить INACTIVE
type OperatorStationStatus = Extract<StationStatus, "ACTIVE" | "MAINTENANCE">;

interface ChangeStationStatusPayload {
    id: string;
    status: StationStatus;
}

interface CreateStationPayload {
    city: string;
    address: string;
    latitude: number;
    longitude: number;
}

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
        enabled: !isPublic
    });

    // ===============================
    // INVALIDATE
    // ===============================

    const invalidateAll = async () => {
        await Promise.all([
            qc.invalidateQueries({ queryKey: ["stations"] }),
            qc.invalidateQueries({ queryKey: ["operator-stations"] }),
            qc.invalidateQueries({ queryKey: ["operator-station"] }),
            qc.invalidateQueries({ queryKey: ["station-details"] }),
        ]);
    };

    // ===============================
    // ADMIN
    // ===============================

    const create = useMutation({
        mutationFn: (payload: CreateStationPayload) =>
            stationsApi.createStation(payload),
        onSuccess: invalidateAll,
    });

    const remove = useMutation({
        mutationFn: (id: string) => stationsApi.deleteStation(id),
        onSuccess: invalidateAll,
    });

    // ⚠️ legacy (не удаляем — используется в админке)
    const changeStatus = useMutation({
        mutationFn: ({ id, status }: ChangeStationStatusPayload) =>
            stationsApi.updateStationStatusAdmin(
                id,
                status as Extract<StationStatus, "ACTIVE" | "MAINTENANCE">
            ),
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

    // ===============================
    // RETURN (НЕ ЛОМАЕМ API)
    // ===============================

    return {
        // 🔹 базовые данные (используются везде)
        stations: query.data ?? [],
        operatorStations: operatorQuery.data ?? [],

        isLoading: query.isLoading || operatorQuery.isLoading,
        error: query.error || operatorQuery.error,

        // 🔹 ADMIN
        createStation: create.mutateAsync,
        deleteStation: remove.mutateAsync,
        changeStationStatus: changeStatus.mutateAsync, // legacy

        // 🔹 OPERATOR
        changeStationStatusOperator: changeStatusOperator.mutateAsync,

        // 🔹 сервис
        refresh: invalidateAll,
    };
}