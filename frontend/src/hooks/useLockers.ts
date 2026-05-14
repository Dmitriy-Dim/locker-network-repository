import { useMutation, useQueryClient } from "@tanstack/react-query";
import { lockersApi } from "../api/lockersApi";
import type { LockerTechStatus, LockerStatus } from "../types/index";

interface ChangeLockerStatusPayload {
    lockerBoxId: string;
    techStatus: LockerTechStatus;
}

interface ChangeLockerBusinessStatusPayload {
    lockerBoxId: string;
    status: LockerStatus;
}

export function useLockers() {
    const qc = useQueryClient();

    const invalidateAll = async () => {
        await Promise.all([
            qc.invalidateQueries({ queryKey: ["lockers"] }),
            qc.invalidateQueries({ queryKey: ["stations"] }),
            qc.invalidateQueries({ queryKey: ["station-details"] }),
            qc.invalidateQueries({ queryKey: ["operator-station"] }),
            qc.invalidateQueries({ queryKey: ["operator-stations"] }),
            qc.invalidateQueries({ queryKey: ["bookings-my"] }),
            qc.invalidateQueries({ queryKey: ["my-bookings"] }),
        ]);
    };

    const changeStatus = useMutation({
        mutationFn: ({ lockerBoxId, techStatus }: ChangeLockerStatusPayload) =>
            lockersApi.updateLockerTechStatusOperator(lockerBoxId, techStatus),

        onSuccess: async () => {
            await invalidateAll();
        },

        onError: (error) => {
            console.error("Locker status update failed", error);
        }
    });

    const changeBusinessStatus = useMutation({
        mutationFn: ({ lockerBoxId, status }: ChangeLockerBusinessStatusPayload) =>
            lockersApi.updateLockerStatusOperator(lockerBoxId, status),

        onSuccess: async () => {
            await invalidateAll();
        },

        onError: (error) => {
            console.error("Locker business status update failed", error);
        }
    });

    const cancelBookingMutation = useMutation({
        mutationFn: (bookingId: string) =>
            lockersApi.cancelBooking(bookingId),

        onSuccess: invalidateAll
    });

    const activate = (id: string) =>
        changeStatus.mutateAsync({ lockerBoxId: id, techStatus: "ACTIVE" });

    const setMaintenance = (id: string) =>
        changeStatus.mutateAsync({ lockerBoxId: id, techStatus: "MAINTENANCE" });

    const setFaulty = (id: string) =>
        changeStatus.mutateAsync({ lockerBoxId: id, techStatus: "FAULTY" });

    const setInactive = (id: string) =>
        changeStatus.mutateAsync({ lockerBoxId: id, techStatus: "INACTIVE" });

    // Helper methods for business status
    const setAvailable = (id: string) =>
        changeBusinessStatus.mutateAsync({ lockerBoxId: id, status: "AVAILABLE" });

    const setReserved = (id: string) =>
        changeBusinessStatus.mutateAsync({ lockerBoxId: id, status: "RESERVED" });

    const setOccupied = (id: string) =>
        changeBusinessStatus.mutateAsync({ lockerBoxId: id, status: "OCCUPIED" });

    const setExpired = (id: string) =>
        changeBusinessStatus.mutateAsync({ lockerBoxId: id, status: "EXPIRED" });

    return {
        changeLockerTechStatus: changeStatus.mutateAsync,
        isUpdating: changeStatus.isPending,

        activate,
        setMaintenance,
        setFaulty,
        setInactive,

        // Business status methods
        changeLockerStatus: changeBusinessStatus.mutateAsync,
        isUpdatingBusinessStatus: changeBusinessStatus.isPending,
        setAvailable,
        setReserved,
        setOccupied,
        setExpired,

        cancelBooking: cancelBookingMutation.mutateAsync
    };
}