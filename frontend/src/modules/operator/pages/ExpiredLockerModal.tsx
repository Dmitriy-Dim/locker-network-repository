import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Box, Typography, Chip, Button, CircularProgress, Divider, Alert, Stack
} from '@mui/material';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockIcon from '@mui/icons-material/Lock';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useOperatorBatchOperation } from '../../../hooks/useOperatorBatchOperation';

interface LockerBox {
    lockerBoxId: string;
    code: string;
    size: 'S' | 'M' | 'L';
    status: string;
    techStatus: string;
    pricePerHour?: string;
}

interface StationMeta {
    stationId: string;
    address: string;
    city: string;
}

interface Props {
    open: boolean;
    locker: LockerBox | null;
    station: StationMeta;
    onClose: () => void;
    onDone: () => void;
}

const sizeLabel = { S: 'Small', M: 'Medium', L: 'Large' };

const statusColor = (s: string): 'success' | 'error' | 'warning' | 'default' => {
    switch (s) {
        case 'AVAILABLE': return 'success';
        case 'EXPIRED': return 'error';
        case 'OCCUPIED': return 'warning';
        default: return 'default';
    }
};

export function ExpiredLockerModal({ open, locker, station, onClose, onDone }: Props) {
    const {
        openBatch, openOperation, isOpenPending,
        closeBatch, closeOperation, isClosePending, closeSucceeded, closeFailed,
        resetOperation,
        openError, closeError,
    } = useOperatorBatchOperation();

    if (!locker) return null;

    const handleOpen = async () => {
        await openBatch({
            stationId: station.stationId,
            mode: 'IDS',
            lockerBoxIds: [locker.lockerBoxId],
            reason: 'confiscation of expired items',
        });
    };

    const handleClose = async () => {
        await closeBatch({
            stationId: station.stationId,
            mode: 'IDS',
            lockerBoxIds: [locker.lockerBoxId],
            reason: 'confiscation of expired items — locker closed after item removal',
        });
    };

    const handleDone = () => {
        resetOperation();
        onDone();
        onClose();
    };

    const handleCancel = () => {
        resetOperation();
        onClose();
    };

    // open batch — backend returns opened[]
    const openedBox = openOperation?.opened?.[0] ?? null;
    const failedBox = openOperation?.failed?.[0] ?? null;
    const openSucceeded = openOperation?.status === 'SUCCESS' && (openOperation?.openedCount ?? 0) > 0;
    const openFailed = openOperation?.status === 'FAILED' || openOperation?.status === 'EXPIRED';

    // close batch — backend returns closed[] not opened[]
    const closedBox = closeOperation?.closed?.[0] ?? null;

    const phase =
        closeSucceeded   ? 'done'         :
            closeFailed      ? 'close_error'  :
                isClosePending   ? 'closing'      :
                    openSucceeded    ? 'open_success' :
                        openFailed       ? 'open_error'   :
                            isOpenPending    ? 'opening'      :
                                'idle';

    return (
        <Dialog
            open={open}
            onClose={phase === 'idle' ? handleCancel : undefined}
            fullWidth
            maxWidth="xs"
            PaperProps={{
                sx: {
                    borderRadius: 3,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
                }
            }}
        >
            <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
                Locker Management
            </DialogTitle>

            <DialogContent>
                <Box sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <Stack spacing={0.5}>
                        <Typography variant="subtitle2" color="text.secondary">
                            {station.city} · {station.address}
                        </Typography>
                        <Typography fontWeight={800} fontSize={18}>
                            Box #{locker.code}
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center" mt={0.5}>
                            <Chip label={locker.status} size="small" color={statusColor(locker.status)} sx={{ fontWeight: 700 }} />
                            <Chip label={sizeLabel[locker.size]} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
                            {locker.pricePerHour && (
                                <Typography variant="caption" color="text.secondary">₪{locker.pricePerHour}/h</Typography>
                            )}
                        </Stack>
                    </Stack>
                </Box>

                <Divider sx={{ mb: 2 }} />

                {phase === 'idle' && (
                    <Box textAlign="center" py={1}>
                        <LockIcon sx={{ fontSize: 40, color: '#94a3b8', mb: 1 }} />
                        <Typography variant="body2" color="text.secondary">
                            Press <strong>Open</strong> to unlock the locker.
                            After removing items, press <strong>Close</strong>.
                        </Typography>
                    </Box>
                )}

                {(phase === 'opening' || phase === 'closing') && (
                    <Box textAlign="center" py={2}>
                        <CircularProgress size={40} sx={{ color: '#6baf5c', mb: 1.5 }} />
                        <Typography variant="body2" color="text.secondary">
                            {phase === 'opening' ? 'Opening locker…' : 'Closing locker…'}
                        </Typography>
                    </Box>
                )}

                {phase === 'open_success' && (
                    <Box>
                        <Alert icon={<LockOpenIcon />} severity="success" sx={{ mb: 2, borderRadius: 2, fontWeight: 600 }}>
                            Locker is open. Remove items and press Close.
                        </Alert>
                        {openedBox && (
                            <Stack direction="row" spacing={2} justifyContent="center">
                                <Chip label={`Lock: ${openedBox.lockStatus}`} color="warning" />
                                <Chip label={`Door: ${openedBox.doorStatus}`} color="warning" />
                            </Stack>
                        )}
                    </Box>
                )}

                {phase === 'open_error' && (
                    <Alert severity="error" icon={<ErrorOutlineIcon />} sx={{ borderRadius: 2 }}>
                        {failedBox?.errorMessage ?? openError?.message ?? 'Failed to open locker.'}
                        {failedBox?.errorCode === 'OPEN_ATTEMPTS_EXHAUSTED' && (
                            <Typography variant="caption" display="block" mt={0.5}>
                                All 3 attempts exhausted. Consider replacing the locker.
                            </Typography>
                        )}
                    </Alert>
                )}

                {phase === 'done' && (
                    <Box>
                        <Alert icon={<CheckCircleOutlineIcon />} severity="success" sx={{ mb: 2, borderRadius: 2, fontWeight: 600 }}>
                            Locker closed. Status updated to <strong>AVAILABLE</strong>.
                        </Alert>
                        {closedBox && (
                            <Stack direction="row" spacing={2} justifyContent="center">
                                <Chip label={`Lock: ${closedBox.lockStatus}`} color="success" />
                                <Chip label={`Door: ${closedBox.doorStatus}`} color="success" />
                            </Stack>
                        )}
                    </Box>
                )}

                {phase === 'close_error' && (
                    <Alert severity="error" icon={<ErrorOutlineIcon />} sx={{ borderRadius: 2 }}>
                        {closeOperation?.failed?.[0]?.errorMessage ?? closeError?.message ?? 'Failed to close locker. Please retry or contact support.'}
                    </Alert>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
                {phase === 'idle' && (
                    <>
                        <Button onClick={handleCancel} sx={{ color: '#64748b', fontWeight: 700 }}>Cancel</Button>
                        <Button
                            variant="contained"
                            startIcon={<LockOpenIcon />}
                            onClick={handleOpen}
                            sx={{ bgcolor: '#e53e3e', fontWeight: 700, borderRadius: 2, '&:hover': { bgcolor: '#c53030' } }}
                        >
                            Open Locker
                        </Button>
                    </>
                )}

                {phase === 'opening' && (
                    <Button disabled sx={{ fontWeight: 700 }}>Opening…</Button>
                )}

                {phase === 'open_success' && (
                    <Button
                        variant="contained"
                        startIcon={<LockIcon />}
                        onClick={handleClose}
                        sx={{ bgcolor: '#6baf5c', fontWeight: 700, borderRadius: 2, '&:hover': { bgcolor: '#5a9a4d' } }}
                    >
                        Close Locker
                    </Button>
                )}

                {phase === 'closing' && (
                    <Button disabled sx={{ fontWeight: 700 }}>Closing…</Button>
                )}

                {(phase === 'done' || phase === 'close_error') && (
                    <Button
                        variant="contained"
                        onClick={handleDone}
                        sx={{ bgcolor: '#6baf5c', fontWeight: 700, borderRadius: 2 }}
                    >
                        Done
                    </Button>
                )}

                {phase === 'open_error' && (
                    <>
                        <Button onClick={handleCancel} sx={{ color: '#64748b', fontWeight: 700 }}>Cancel</Button>
                        <Button
                            variant="contained"
                            onClick={handleOpen}
                            sx={{ bgcolor: '#e53e3e', fontWeight: 700, borderRadius: 2 }}
                        >
                            Retry Open
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
}