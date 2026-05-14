import { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Box, Typography, Chip, Button, CircularProgress, Divider, Alert, Stack,
    TextField, MenuItem, ToggleButton, ToggleButtonGroup
} from '@mui/material';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockIcon from '@mui/icons-material/Lock';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useOperatorBatchOperation } from '../../../hooks/useOperatorBatchOperation';

interface Props {
    open: boolean;
    stationId: string;
    stationLabel: string;
    onClose: () => void;
    onDone: () => void;
}

type Mode = 'ALL' | 'STATUS' | 'IDS';
type Phase = 'open_form' | 'opening' | 'open_result' | 'close_form' | 'closing' | 'close_result';

const STATUS_OPTIONS = ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'EXPIRED', 'FAULTY'];

export function BatchOperationsModal({ open, stationId, stationLabel, onClose, onDone }: Props) {
    const {
        openBatch, openOperation, isOpenPending, openError,
        closeBatch, closeOperation, isClosePending, closeSucceeded, closeFailed, closeError,
        resetOperation,
    } = useOperatorBatchOperation();

    // ── open form state ───────────────────────────────────────────────────────
    const [openMode, setOpenMode] = useState<Mode>('STATUS');
    const [openStatus, setOpenStatus] = useState('EXPIRED');
    const [openIds, setOpenIds] = useState('');
    const [openReason, setOpenReason] = useState('confiscation of expired items');

    // ── close form state ──────────────────────────────────────────────────────
    const [closeMode, setCloseMode] = useState<Mode>('STATUS');
    const [closeStatus, setCloseStatus] = useState('EXPIRED');
    const [closeIds, setCloseIds] = useState('');
    const [closeReason, setCloseReason] = useState('locker closed after item removal');

    // ── close form visibility ─────────────────────────────────────────────────
    const [closeFormVisible, setCloseFormVisible] = useState(false);

    // ── phase ─────────────────────────────────────────────────────────────────
    const openSettled = openOperation?.status === 'SUCCESS' || openOperation?.status === 'FAILED' || openOperation?.status === 'EXPIRED';

    const derivePhase = (): Phase => {
        if (!openOperation) return 'open_form';
        if (isOpenPending) return 'opening';
        if (openSettled) {
            if (!closeOperation && !closeFormVisible) return 'open_result';
            if (!closeOperation && closeFormVisible) return 'close_form';
            if (isClosePending) return 'closing';
            if (closeSucceeded || closeFailed) return 'close_result';
        }
        return 'opening';
    };

    const phase = derivePhase();

    // ── handlers ──────────────────────────────────────────────────────────────
    const handleOpen = async () => {
        const ids = openMode === 'IDS'
            ? openIds.split(',').map(s => s.trim()).filter(Boolean)
            : undefined;
        if (openMode === 'IDS' && (!ids || ids.length === 0)) return;
        if (!openReason.trim()) return;

        await openBatch({
            stationId,
            mode: openMode,
            status: openMode === 'STATUS' ? openStatus : undefined,
            lockerBoxIds: ids,
            reason: openReason.trim(),
        });
    };

    const handleShowCloseForm = () => {
        setCloseFormVisible(true);
    };

    const handleClose = async () => {
        const ids = closeMode === 'IDS'
            ? closeIds.split(',').map(s => s.trim()).filter(Boolean)
            : undefined;
        if (closeMode === 'IDS' && (!ids || ids.length === 0)) return;
        if (!closeReason.trim()) return;

        await closeBatch({
            stationId,
            mode: closeMode,
            status: closeMode === 'STATUS' ? closeStatus : undefined,
            lockerBoxIds: ids,
            reason: closeReason.trim(),
        });
    };

    const handleDone = () => {
        resetOperation();
        setCloseFormVisible(false);
        setOpenIds('');
        setCloseIds('');
        onDone();
        onClose();
    };

    const handleCancel = () => {
        resetOperation();
        setCloseFormVisible(false);
        setOpenIds('');
        setCloseIds('');
        onClose();
    };

    // ── open result data ──────────────────────────────────────────────────────
    const openTotal = openOperation?.total ?? 0;
    const openedCount = openOperation?.openedCount ?? 0;
    const openFailedCount = openOperation?.failedCount ?? 0;
    const openedList = openOperation?.opened ?? [];
    const openFailedList = openOperation?.failed ?? [];

    // ── close result data — backend uses `closed` and `closedCount` ──────────
    const closeTotal = closeOperation?.total ?? 0;
    const closedCount = closeOperation?.closedCount ?? 0;
    const closeFailedCount = closeOperation?.failedCount ?? 0;
    const closedList = closeOperation?.closed ?? [];
    const closeFailedList = closeOperation?.failed ?? [];

    // ── mode selector sub-component ──────────────────────────────────────────
    const renderModeForm = (
        mode: Mode, setMode: (m: Mode) => void,
        status: string, setStatus: (s: string) => void,
        ids: string, setIds: (s: string) => void,
        reason: string, setReason: (s: string) => void,
        label: string,
    ) => (
        <Stack spacing={2}>
            <Box>
                <Typography variant="caption" fontWeight={700} color="text.secondary" mb={0.5} display="block">
                    MODE
                </Typography>
                <ToggleButtonGroup
                    value={mode}
                    exclusive
                    onChange={(_, v) => v && setMode(v as Mode)}
                    size="small"
                    fullWidth
                >
                    <ToggleButton value="ALL" sx={{ fontWeight: 700, fontSize: 12 }}>ALL</ToggleButton>
                    <ToggleButton value="STATUS" sx={{ fontWeight: 700, fontSize: 12 }}>BY STATUS</ToggleButton>
                    <ToggleButton value="IDS" sx={{ fontWeight: 700, fontSize: 12 }}>BY IDS</ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {mode === 'STATUS' && (
                <TextField
                    select
                    label="Status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    size="small"
                    fullWidth
                >
                    {STATUS_OPTIONS.map(s => (
                        <MenuItem key={s} value={s}>{s}</MenuItem>
                    ))}
                </TextField>
            )}

            {mode === 'IDS' && (
                <TextField
                    label="Locker IDs (comma-separated)"
                    value={ids}
                    onChange={(e) => setIds(e.target.value)}
                    size="small"
                    fullWidth
                    multiline
                    minRows={2}
                    placeholder="uuid-1, uuid-2, ..."
                />
            )}

            <TextField
                label={`Reason (${label})`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                size="small"
                fullWidth
                required
            />
        </Stack>
    );

    // ── result renderer ──────────────────────────────────────────────────────
    const renderResult = (
        total: number,
        successCount: number,
        failCount: number,
        successList: any[],
        failList: any[],
        operationStatus: string | undefined,
        label: 'open' | 'close',
    ) => (
        <Box>
            {/* summary bar */}
            <Stack direction="row" spacing={2} mb={2} p={1.5} borderRadius={2} bgcolor="#f8fafc" border="1px solid #e2e8f0">
                <Typography variant="body2" fontWeight={700}>Total: {total}</Typography>
                <Typography variant="body2" fontWeight={700} color="success.main">
                    {label === 'open' ? 'Opened' : 'Closed'}: {successCount}
                </Typography>
                <Typography variant="body2" fontWeight={700} color="error.main">
                    Failed: {failCount}
                </Typography>
            </Stack>

            {/* status badge */}
            {operationStatus === 'SUCCESS' && (
                <Alert icon={<CheckCircleOutlineIcon />} severity="success" sx={{ mb: 2, borderRadius: 2 }}>
                    Batch {label} completed{failCount > 0 ? ' with partial failures' : ' successfully'}.
                </Alert>
            )}
            {operationStatus !== 'SUCCESS' && (
                <Alert icon={<ErrorOutlineIcon />} severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                    Batch {label} failed ({operationStatus}). No lockers were {label === 'open' ? 'opened' : 'closed'}.
                </Alert>
            )}

            {/* success list */}
            {successList.length > 0 && (
                <Box mb={2}>
                    <Typography variant="caption" fontWeight={700} color="success.main" mb={0.5} display="block">
                        {label === 'open' ? 'OPENED' : 'CLOSED'}
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" gap={0.5}>
                        {successList.map((item: any, i: number) => (
                            <Chip
                                key={i}
                                size="small"
                                color="success"
                                variant="outlined"
                                label={
                                    <Typography variant="caption" fontFamily="monospace">
                                        {item.lockerBoxId?.slice(0, 8)}… {item.lockStatus}/{item.doorStatus}
                                    </Typography>
                                }
                            />
                        ))}
                    </Stack>
                </Box>
            )}

            {/* fail list */}
            {failList.length > 0 && (
                <Box>
                    <Typography variant="caption" fontWeight={700} color="error.main" mb={0.5} display="block">
                        FAILED
                    </Typography>
                    <Stack spacing={0.5}>
                        {failList.map((item: any, i: number) => (
                            <Box
                                key={i}
                                px={1.5} py={1} borderRadius={1.5}
                                bgcolor="#fff5f5" border="1px solid #fed7d7"
                            >
                                <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
                                    {item.lockerBoxId?.slice(0, 8)}…
                                </Typography>
                                <Typography variant="caption" color="error.main" ml={1}>
                                    {item.errorMessage ?? item.errorCode ?? 'Unknown error'}
                                </Typography>
                            </Box>
                        ))}
                    </Stack>
                </Box>
            )}
        </Box>
    );

    return (
        <Dialog
            open={open}
            onClose={phase === 'open_form' ? handleCancel : undefined}
            fullWidth
            maxWidth="sm"
            PaperProps={{
                sx: {
                    borderRadius: 3,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
                }
            }}
        >
            <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>
                Batch Operations
                <Typography variant="body2" color="text.secondary">
                    {stationLabel}
                </Typography>
            </DialogTitle>

            <DialogContent>
                <Divider sx={{ mb: 2 }} />

                {/* ── PHASE: open form ── */}
                {phase === 'open_form' && (
                    <Box>
                        <Typography variant="subtitle2" fontWeight={700} mb={1.5} color="#e53e3e">
                            Step 1 — Open Lockers
                        </Typography>
                        {renderModeForm(openMode, setOpenMode, openStatus, setOpenStatus, openIds, setOpenIds, openReason, setOpenReason, 'open')}
                    </Box>
                )}

                {/* ── PHASE: opening ── */}
                {phase === 'opening' && (
                    <Box textAlign="center" py={3}>
                        <CircularProgress size={44} sx={{ color: '#e53e3e', mb: 1.5 }} />
                        <Typography variant="body2" color="text.secondary">
                            Opening lockers…
                        </Typography>
                    </Box>
                )}

                {/* ── PHASE: open result ── */}
                {phase === 'open_result' && (
                    <Box>
                        <Typography variant="subtitle2" fontWeight={700} mb={1.5} color="#e53e3e">
                            Open Result
                        </Typography>
                        {renderResult(openTotal, openedCount, openFailedCount, openedList, openFailedList, openOperation?.status, 'open')}
                        {openError && (
                            <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
                                {openError.message}
                            </Alert>
                        )}
                    </Box>
                )}

                {/* ── PHASE: close form ── */}
                {phase === 'close_form' && (
                    <Box>
                        <Typography variant="subtitle2" fontWeight={700} mb={0.5} color="#e53e3e">
                            Open Result
                        </Typography>
                        <Stack direction="row" spacing={1} mb={2} alignItems="center">
                            <Chip label={`Opened: ${openedCount}`} color="success" size="small" sx={{ fontWeight: 700 }} />
                            {openFailedCount > 0 && (
                                <Chip label={`Failed: ${openFailedCount}`} color="error" size="small" sx={{ fontWeight: 700 }} />
                            )}
                        </Stack>

                        <Divider sx={{ mb: 2 }} />

                        <Typography variant="subtitle2" fontWeight={700} mb={1.5} color="#6baf5c">
                            Step 2 — Close Lockers
                        </Typography>
                        {renderModeForm(closeMode, setCloseMode, closeStatus, setCloseStatus, closeIds, setCloseIds, closeReason, setCloseReason, 'close')}
                    </Box>
                )}

                {/* ── PHASE: closing ── */}
                {phase === 'closing' && (
                    <Box textAlign="center" py={3}>
                        <CircularProgress size={44} sx={{ color: '#6baf5c', mb: 1.5 }} />
                        <Typography variant="body2" color="text.secondary">
                            Closing lockers…
                        </Typography>
                    </Box>
                )}

                {/* ── PHASE: close result ── */}
                {phase === 'close_result' && (
                    <Box>
                        <Typography variant="subtitle2" fontWeight={700} mb={1.5} color="#6baf5c">
                            Close Result
                        </Typography>
                        {renderResult(closeTotal, closedCount, closeFailedCount, closedList, closeFailedList, closeOperation?.status, 'close')}
                        {closeError && (
                            <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
                                {closeError.message}
                            </Alert>
                        )}
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
                {phase === 'open_form' && (
                    <>
                        <Button onClick={handleCancel} sx={{ color: '#64748b', fontWeight: 700 }}>
                            Cancel
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={<LockOpenIcon />}
                            onClick={handleOpen}
                            disabled={!openReason.trim() || (openMode === 'IDS' && !openIds.trim())}
                            sx={{
                                bgcolor: '#e53e3e', fontWeight: 700, borderRadius: 2,
                                '&:hover': { bgcolor: '#c53030' }
                            }}
                        >
                            Open Lockers
                        </Button>
                    </>
                )}

                {phase === 'opening' && (
                    <Button disabled sx={{ fontWeight: 700 }}>Opening…</Button>
                )}

                {phase === 'open_result' && (
                    <>
                        <Button onClick={handleDone} sx={{ color: '#64748b', fontWeight: 700 }}>
                            Done
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={<PlayArrowIcon />}
                            onClick={handleShowCloseForm}
                            sx={{
                                bgcolor: '#6baf5c', fontWeight: 700, borderRadius: 2,
                                '&:hover': { bgcolor: '#5a9a4d' }
                            }}
                        >
                            Proceed to Close
                        </Button>
                    </>
                )}

                {phase === 'close_form' && (
                    <>
                        <Button onClick={handleDone} sx={{ color: '#64748b', fontWeight: 700 }}>
                            Cancel
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={<LockIcon />}
                            onClick={handleClose}
                            disabled={!closeReason.trim() || (closeMode === 'IDS' && !closeIds.trim())}
                            sx={{
                                bgcolor: '#6baf5c', fontWeight: 700, borderRadius: 2,
                                '&:hover': { bgcolor: '#5a9a4d' }
                            }}
                        >
                            Close Lockers
                        </Button>
                    </>
                )}

                {phase === 'closing' && (
                    <Button disabled sx={{ fontWeight: 700 }}>Closing…</Button>
                )}

                {phase === 'close_result' && (
                    <Button
                        variant="contained"
                        onClick={handleDone}
                        sx={{ bgcolor: '#6baf5c', fontWeight: 700, borderRadius: 2 }}
                    >
                        Done
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}