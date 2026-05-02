import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLockerOperation } from '../../../hooks/useLockerOperation';

interface LockerDoorControlProps {
    bookingId: string;
    lockerBoxId: string;
    onChangeLockerRequest: () => void;
}

export function LockerDoorControl({ bookingId, lockerBoxId, onChangeLockerRequest }: LockerDoorControlProps) {
    const qc = useQueryClient();
    const {
        openLocker,
        closeLocker,
        operation,
        isWorking,
        resetOperation
    } = useLockerOperation();

    useEffect(() => {
        if (operation?.status === 'FAILED' && operation.result?.nextAction === 'CHANGE_LOCKER') {
            alert("The cell appears to be stuck. Please select another one.");
            onChangeLockerRequest();
            resetOperation();
        }

        if (operation?.type === 'LOCKER_CLOSE' && operation?.status === 'SUCCESS' && operation.result?.doorStatus === 'CLOSED') {
            qc.invalidateQueries({ queryKey: ['my-bookings'] });
        }
    }, [operation, onChangeLockerRequest, resetOperation, qc]);

    const canShowCloseButton =
        operation?.status === 'SUCCESS' &&
        operation.result?.lockStatus === 'UNLOCKED' &&
        operation.result?.doorStatus === 'OPEN';

    const isSuccessfullyClosed =
        operation?.type === 'LOCKER_CLOSE' &&
        operation?.status === 'SUCCESS' &&
        operation.result?.doorStatus === 'CLOSED' &&
        operation.result?.lockStatus === 'LOCKED';

    return (
        <div className="p-5 border rounded-lg shadow-sm bg-white mt-4">
            <h3 className="text-lg font-bold mb-3">Locker: {lockerBoxId}</h3>

            {isWorking && (
                <div className="mb-4 text-blue-600 font-medium animate-pulse">
                    Contacting the device... Please wait.
                </div>
            )}

            {operation?.status === 'FAILED' && operation.result?.nextAction !== 'CHANGE_LOCKER' && (
                <div className="mb-4 text-red-600 bg-red-50 p-3 rounded">
                    Error: {operation.errorMessage || "Failed to perform action"}
                </div>
            )}

            {isSuccessfullyClosed && (
                <div className="mb-4 text-green-600 bg-green-50 p-3 rounded">
                    The cell has been successfully closed! Reservation completed.
                </div>
            )}

            <div className="flex gap-4">
                {!isWorking && !canShowCloseButton && !isSuccessfullyClosed && (
                    <button
                        onClick={() => openLocker(bookingId)}
                        className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 transition-colors"
                    >
                        Open locker
                    </button>
                )}

                {canShowCloseButton && (
                    <button
                        onClick={() => closeLocker(bookingId)}
                        disabled={isWorking}
                        className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        Close locker
                    </button>
                )}
            </div>

            {/*FOR TESTING */}
            {operation && (
                <div className="mt-6 p-3 bg-gray-100 text-xs rounded font-mono text-gray-700">
                    <p className="font-bold mb-1">Debug Info:</p>
                    <p>Status: {operation.status}</p>
                    <p>Lock: {operation.result?.lockStatus || 'N/A'}</p>
                    <p>Door: {operation.result?.doorStatus || 'N/A'}</p>
                    <p>Attempts: {operation.result?.attemptCount || 0} / {operation.result?.maxAttempts || 3}</p>
                    <p>Next Action: {operation.result?.nextAction || 'NONE'}</p>
                </div>
            )}
        </div>
    );
}