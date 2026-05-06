import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { stationsApi } from "../api/stationsApi";
import { useAuth } from "./useAuth";
import type { LockerStation, StationStatus } from "../types/index";

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
    const { user } = useAuth();

    const isPublic = options?.publicOnly;
    const limit = options?.limit;
    const role = user?.role;

    // ===============================
    // QUERIES
    // ===============================


    const query = useQuery<LockerStation[]>({
        queryKey: ["stations", isPublic ? "public" : role, limit],
        queryFn: async () => {
            if (isPublic) return await stationsApi.getActiveStations(limit);
            if (role === "OPERATOR") return await stationsApi.getOperatorStations(limit);
            if (role === "ADMIN") return await stationsApi.getAllStations(limit);
            return [];
        },

        enabled: isPublic ? true : !!role,
        retry: false
    });

    // ===============================
    // INVALIDATE
    // ===============================

    const invalidateAll = async () => {
        await Promise.all([
            qc.invalidateQueries({ queryKey: ["stations"] }),
            qc.invalidateQueries({ queryKey: ["station-details"] }),
        ]);
    };

    // ===============================
    // MUTATIONS
    // ===============================

    const create = useMutation({
        mutationFn: (payload: CreateStationPayload) => stationsApi.createStation(payload),
        onSuccess: invalidateAll,
    });

    const remove = useMutation({
        mutationFn: (id: string) => stationsApi.deleteStation(id),
        onSuccess: invalidateAll,
    });

    const changeStatus = useMutation({
        mutationFn: ({ id, status }: ChangeStationStatusPayload) =>
            stationsApi.updateStationStatusAdmin(
                id,
                status as Extract<StationStatus, "ACTIVE" | "MAINTENANCE">
            ),
        onSuccess: invalidateAll,
    });

    const changeStatusOperator = useMutation({
        mutationFn: ({ id, status }: { id: string; status: OperatorStationStatus }) =>
            stationsApi.updateStationStatusOperator(id, status),
        onSuccess: invalidateAll,
    });

    // ===============================
    // RETURN
    // ===============================

    return {

        stations: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,

        createStation: create.mutateAsync,
        deleteStation: remove.mutateAsync,
        changeStationStatus: changeStatus.mutateAsync,
        changeStationStatusOperator: changeStatusOperator.mutateAsync,

        refresh: invalidateAll,
    };
}