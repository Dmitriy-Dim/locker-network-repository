import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { stationsApi } from "../api/stationsApi";
import { useAuth } from "./useAuth";
import type { LockerStation } from "../types/index";

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
    const isOperator = user?.role === "OPERATOR";
    const isAdmin = user?.role === "ADMIN";

    // ===============================
    // QUERY (роль-зависимая)
    // ===============================

    const query = useQuery<LockerStation[]>({
        queryKey: [
            isPublic
                ? "public-stations"
                : isOperator
                    ? "operator-stations"
                    : "admin-stations",
            limit
        ],
        queryFn: () => {
            if (isPublic) return stationsApi.getActiveStations(limit);
            if (isOperator) return stationsApi.getOperatorStations(limit);
            return stationsApi.getAllStations(limit);
        },
    });

    const invalidateAll = () => {
        qc.invalidateQueries({ queryKey: ["public-stations"] });
        qc.invalidateQueries({ queryKey: ["operator-stations"] });
        qc.invalidateQueries({ queryKey: ["admin-stations"] });
        qc.invalidateQueries({ queryKey: ["station-details"] });
    };

    // ===============================
    // ADMIN ACTIONS
    // ===============================

    const create = useMutation({
        mutationFn: (payload: CreateStationPayload) =>
            stationsApi.createStation(payload),
        onSuccess: invalidateAll,
    });

    const addLocker = useMutation({
        mutationFn: (payload: {
            stationId: string;
            code: string;
            size: "S" | "M" | "L";
        }) => stationsApi.addLocker(payload),
        onSuccess: invalidateAll,
    });

    // ===============================
    // OPERATOR ACTIONS
    // ===============================

    const changeStatus = useMutation({
        mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "MAINTENANCE" }) => {
            if (!isOperator) {
                throw new Error("Only operator can change station status");
            }
            return stationsApi.updateStationStatusOperator(id, status);
        },
        onSuccess: invalidateAll,
    });

    const remove = useMutation({
        mutationFn: (id: string) => {
            if (!isOperator) {
                throw new Error("Only operator can delete station");
            }
            return stationsApi.deleteStation(id);
        },
        onSuccess: invalidateAll,
    });

    // ===============================
    // RETURN
    // ===============================

    return {
        stations: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,

        // ADMIN
        createStation: isAdmin ? create.mutateAsync : undefined,
        addLocker: isAdmin ? addLocker.mutateAsync : undefined,

        // OPERATOR
        changeStationStatus: isOperator ? changeStatus.mutateAsync : undefined,
        deleteStation: isOperator ? remove.mutateAsync : undefined,

        refresh: invalidateAll,
    };
}