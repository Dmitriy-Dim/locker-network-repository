import { useMutation, useQueryClient } from "@tanstack/react-query";
import { lockersApi } from "../api/lockersApi";
import type { LockerTechStatus } from "../types/index";

interface ChangeLockerStatusPayload {
    lockerBoxId: string;
    techStatus: LockerTechStatus;
}

export function useLockers() {
    const qc = useQueryClient();

    const invalidateAll = () => {
        qc.invalidateQueries({ queryKey: ["lockers"] });
        qc.invalidateQueries({ queryKey: ["stations"] });
        qc.invalidateQueries({ queryKey: ["station-details"] });
        qc.invalidateQueries({ queryKey: ["operator-stations"] });
        qc.invalidateQueries({ queryKey: ["bookings-my"] }); // 👈 важно
    };

    // 🔧 tech status
    const changeStatus = useMutation({
        mutationFn: ({ lockerBoxId, techStatus }: ChangeLockerStatusPayload) =>
            lockersApi.updateLockerTechStatusOperator(lockerBoxId, techStatus),

        onSuccess: invalidateAll,
        onError: (error) => {
            console.error("Locker status update failed", error);
        }
    });

    // 🔧 booking cancel
    const cancelBookingMutation = useMutation({
        mutationFn: (bookingId: string) =>
            lockersApi.cancelBooking(bookingId),

        onSuccess: invalidateAll,
        onError: (e) => {
            console.error("Cancel booking failed", e);
        }
    });

    // helpers
    const activate = (id: string) =>
        changeStatus.mutateAsync({ lockerBoxId: id, techStatus: "ACTIVE" });

    const setMaintenance = (id: string) =>
        changeStatus.mutateAsync({ lockerBoxId: id, techStatus: "MAINTENANCE" });

    const setFaulty = (id: string) =>
        changeStatus.mutateAsync({ lockerBoxId: id, techStatus: "FAULTY" });

    const setInactive = (id: string) =>
        changeStatus.mutateAsync({ lockerBoxId: id, techStatus: "INACTIVE" });

    return {
        // locker status
        changeLockerTechStatus: changeStatus.mutateAsync,
        isUpdating: changeStatus.isPending,

        activate,
        setMaintenance,
        setFaulty,
        setInactive,


        cancelBooking: cancelBookingMutation.mutateAsync
    };
}