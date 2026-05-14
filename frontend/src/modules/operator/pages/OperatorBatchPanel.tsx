import React, { useState } from 'react';
import { useOperatorBatchOperation } from '../../../hooks/useOperatorBatchOperation';

export function OperatorBatchPanel({ stationId }: { stationId: string }) {
    // const { openBatch, operation, isWorking, resetOperation } = useOperatorBatchOperation();
    const { openBatch, openOperation: operation, isWorking, resetOperation } = useOperatorBatchOperation();
    const [mode, setMode] = useState<'ALL' | 'STATUS' | 'IDS'>('ALL');
    const [statusFilter, setStatusFilter] = useState('OCCUPIED');
    const [idsInput, setIdsInput] = useState('');
    const [reason, setReason] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        let lockerBoxIds: string[] = [];
        if (mode === 'IDS') {
            lockerBoxIds = idsInput.split(',').map(id => id.trim()).filter(Boolean);
            if (lockerBoxIds.length === 0) {
                alert("Please enter at least one cell ID.");
                return;
            }
        }

        if (!reason.trim()) {
            alert("Please indicate the reason for opening");
            return;
        }

        await openBatch({
            stationId,
            mode,
            status: mode === 'STATUS' ? statusFilter : undefined,
            lockerBoxIds: mode === 'IDS' ? lockerBoxIds : undefined,
            reason
        });
    };

    const batchResult = operation?.result;

    return (
        <div className="p-6 border rounded-lg shadow-md bg-white">
            <h2 className="text-xl font-bold mb-4">Mass opening of cells (Station: {stationId})</h2>

            {!operation && (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Mode open:</label>
                        <select
                            value={mode}
                            onChange={(e) => setMode(e.target.value as any)}
                            className="w-full border rounded p-2"
                        >
                            <option value="ALL">All station cells</option>
                            <option value="STATUS">By status</option>
                            <option value="IDS">By ID</option>
                        </select>
                    </div>

                    {mode === 'STATUS' && (
                        <div>
                            <label className="block text-sm font-medium mb-1">Status:</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="w-full border rounded p-2"
                            >
                                <option value="AVAILABLE">AVAILABLE</option>
                                <option value="RESERVED">RESERVED</option>
                                <option value="OCCUPIED">OCCUPIED</option>
                                <option value="FAULTY">FAULTY</option>
                                <option value="EXPIRED">EXPIRED</option>
                            </select>
                        </div>
                    )}

                    {mode === 'IDS' && (
                        <div>
                            <label className="block text-sm font-medium mb-1">ID lockers (separated by commas):</label>
                            <input
                                type="text"
                                value={idsInput}
                                onChange={(e) => setIdsInput(e.target.value)}
                                placeholder="locker_55, locker_56"
                                className="w-full border rounded p-2"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium mb-1">Reason (Audit Reason):</label>
                        <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="MAINTENANCE, INSPECTION..."
                            className="w-full border rounded p-2"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isWorking}
                        className="bg-red-600 text-white px-6 py-2 rounded font-bold hover:bg-red-700 disabled:opacity-50"
                    >
                        Start
                    </button>
                </form>
            )}

            {isWorking && (
                <div className="mt-4 p-4 bg-blue-50 text-blue-700 rounded animate-pulse">
                    Operation in progress... Polling device.
                </div>
            )}

            {operation && !isWorking && (
                <div className="mt-6">
                    <h3 className="text-lg font-bold mb-2">
                        Result: {operation.status === 'SUCCESS' ? ' Completed' : ' Error'}
                    </h3>

                    {batchResult && (
                        <div className="space-y-3">
                            <div className="flex gap-4 p-3 bg-gray-50 rounded border">
                                <div><strong>Total targets:</strong> {batchResult.total || 0}</div>
                                <div className="text-green-600"><strong>Opened:</strong> {batchResult.openedCount || 0}</div>
                                <div className="text-red-600"><strong>Failed:</strong> {batchResult.failedCount || 0}</div>
                            </div>

                            {batchResult.failed && batchResult.failed.length > 0 && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded">
                                    <h4 className="font-bold text-red-800 mb-2">Failed to open:</h4>
                                    <ul className="list-disc pl-5 text-sm text-red-700 space-y-1">
                                        {batchResult.failed.map((fail: any, idx: number) => (
                                            <li key={idx}>
                                                <strong>{fail.lockerBoxId}</strong>: {fail.errorMessage}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {batchResult.opened && batchResult.opened.length > 0 && (
                                <div className="p-3 bg-green-50 border border-green-200 rounded">
                                    <h4 className="font-bold text-green-800 mb-2">Successfully opened:</h4>
                                    <div className="text-sm text-green-700 flex flex-wrap gap-2">
                                        {batchResult.opened.map((success: any, idx: number) => (
                                            <span key={idx} className="bg-green-100 px-2 py-1 rounded">
                                                {success.lockerBoxId}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <button
                        onClick={resetOperation}
                        className="mt-6 bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
                    >
                        New operation
                    </button>
                </div>
            )}
        </div>
    );
}