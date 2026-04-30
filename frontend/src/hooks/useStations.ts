import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { stationsApi } from "../api/stationsApi";
import type { LockerStation, StationStatus } from "../types/index";

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

export function useStations(options?: { publicOnly?: boolean }) {
    const qc = useQueryClient();
    const isPublic = options?.publicOnly;

    const query = useQuery<LockerStation[]>({
        queryKey: ["stations", isPublic ? "active" : "all"],
        queryFn: isPublic
            ? stationsApi.getActiveStations
            : stationsApi.getAllStations,
    });

    const invalidateAll = () => {
        qc.invalidateQueries({ queryKey: ["stations"] });
        qc.invalidateQueries({ queryKey: ["station-details"] });
        qc.invalidateQueries({ queryKey: ["operator-stations"] });
        qc.invalidateQueries({ queryKey: ["user-station"] });
        qc.invalidateQueries({ queryKey: ["bookings-my"] });
    };

    const create = useMutation({
        mutationFn: (payload: CreateStationPayload) =>
            stationsApi.createStation(payload),
        onSuccess: invalidateAll,
    });

    const remove = useMutation({
        mutationFn: (id: string) => stationsApi.deleteStation(id),
        onSuccess: invalidateAll,
    });

    const changeStatus = useMutation({
        mutationFn: ({ id, status }: ChangeStationStatusPayload) => {
            // if (status === "READY") {
            //     return stationsApi.updateStationStatusOperator(id, status);
            // }

            if (status === "ACTIVE" || status === "MAINTENANCE") {
                return stationsApi.updateStationStatusAdmin(id, status);
            }

            throw new Error("Invalid status transition");
        },
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

    return {
        stations: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,

        createStation: create.mutateAsync,
        deleteStation: remove.mutate,
        changeStationStatus: changeStatus.mutate,
        addLocker: addLocker.mutateAsync,

        refresh: invalidateAll,
    };
}