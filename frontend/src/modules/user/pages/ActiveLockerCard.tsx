import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    Paper, Box, Typography, Stack, Chip, Button, Alert, CircularProgress,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, Skeleton
} from "@mui/material";
import Grid from '@mui/material/Grid';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockIcon from '@mui/icons-material/Lock';
import PaymentIcon from '@mui/icons-material/Payment';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { stationsApi } from "../../../api/stationsApi.ts";
import { lockersApi } from "../../../api/lockersApi.ts";
import { apiClient } from "../../../api/apiClient.ts";
import { getPaymentUrl, removePaymentUrl } from "../../../hooks/useBooking.ts";
import { useDeviceOperation } from "../../../hooks/useDeviceOperation.ts";

const STALE_TIME_EXTENDED = 5 * 60_000;

function ReservedLockerCard({ booking }: { booking: any }) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const bookingId = booking.bookingId || booking.id;
    const stationId = booking.stationId;
    const lockerBoxId = booking.lockerBoxId;

    const [isHidden, setIsHidden] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [isRepaying, setIsRepaying] = useState(false);


    const expiresAt = booking.expiresAt
        ? new Date(booking.expiresAt).getTime()
        : null;

    const [timeLeft, setTimeLeft] = useState<string | null>(null);
    const [isExpired, setIsExpired] = useState(false);

    const { data: stationData, isLoading: isStationLoading } = useQuery({
        queryKey: ['station-details', stationId],
        queryFn: () => stationsApi.getStationById(stationId!),
        enabled: !!stationId && !booking.station?.address,
        staleTime: STALE_TIME_EXTENDED,
    });

    const { data: lockerData, isLoading: isLockerLoading } = useQuery({
        queryKey: ['locker-details', lockerBoxId],
        queryFn: () => lockersApi.getLockerById(lockerBoxId!),
        enabled: !!lockerBoxId && !booking.size,
        staleTime: STALE_TIME_EXTENDED,
    });

    useEffect(() => {
        if (!expiresAt) return;
        const update = () => {
            const diff = expiresAt - Date.now();
            if (diff <= 0) {
                setIsExpired(true);
                setTimeLeft('Expired');
            } else {
                const m = Math.floor(diff / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                setTimeLeft(`${m}m ${s.toString().padStart(2, '0')}s`);
                setIsExpired(false);
            }
        };
        update();
        const t = setInterval(update, 1000);
        return () => clearInterval(t);
    }, [expiresAt]);

    const isLoading = isStationLoading || isLockerLoading;

    const address = booking.station?.address
        || stationData?.address
        || (isLoading ? null : `Station ID: ${stationId?.slice(-6).toUpperCase() ?? 'N/A'}`);

    const lockerCode = booking.code
        || booking.lockerBox?.code
        || lockerData?.code
        || (isLoading ? null : (lockerBoxId?.slice(-4).toUpperCase() || '???'));

    const size = booking.size || booking.lockerBox?.size || lockerData?.size || (isLoading ? null : 'N/A');


    const handleRepay = async () => {
        if (!bookingId) return;
        setIsRepaying(true);
        try {
            const paymentUrl = getPaymentUrl(bookingId);

            if (paymentUrl) {
                window.location.href = paymentUrl;
            } else {
                if (stationId) {
                    navigate(`/stations/${stationId}`);
                } else {
                    alert('Payment link is no longer available. Please start a new booking.');
                }
            }
        } finally {
            setIsRepaying(false);
        }
    };

    const handleCancel = async () => {
        if (!bookingId) return;
        setIsCancelling(true);
        try {
            await apiClient.post(`/bookings/${bookingId}/cancel`);
            removePaymentUrl(bookingId);
            queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
            setIsHidden(true);
        } catch (e: any) {
            const message = e?.response?.data?.error?.message ?? e?.message ?? 'Unknown error';
            alert(`Could not cancel: ${message}`);
        } finally {
            setIsCancelling(false);
        }
    };

    if (isHidden) return null;

    return (
        <Paper sx={{
            p: 4,
            borderRadius: 4,
            borderLeft: '10px solid #f59e0b',
            mb: 2,
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            bgcolor: '#fffbf0',
            minHeight: '180px'
        }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={3}>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="h3" fontWeight={900}>
                        {lockerCode ? `Locker #${lockerCode}` : <Skeleton width={180} />}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" mt={1} mb={2}>
                        <LocationOnIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                        <Typography color="text.secondary" fontWeight={600}>
                            {address || <Skeleton width={250} />}
                        </Typography>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                        <Chip
                            label="RESERVED"
                            sx={{ fontWeight: 700, bgcolor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
                        />
                        {size ? (
                            <Chip label={`Size ${size}`} variant="outlined" sx={{ fontWeight: 700 }} />
                        ) : (
                            <Skeleton variant="rounded" width={80} height={32} sx={{ borderRadius: 4 }} />
                        )}
                    </Stack>
                </Box>

                <Stack alignItems={{ xs: 'stretch', md: 'flex-end' }} spacing={2} sx={{ minWidth: { md: '320px' } }}>


                    {timeLeft && (
                        <Box sx={{
                            p: 2,
                            bgcolor: isExpired ? '#fef2f2' : '#fffbeb',
                            borderRadius: 2,
                            textAlign: 'center',
                            border: `1px solid ${isExpired ? '#fecaca' : '#fde68a'}`,
                            width: '100%',
                        }}>
                            <Stack direction="row" justifyContent="center" alignItems="center" spacing={1}>
                                <HourglassTopIcon sx={{ color: isExpired ? '#dc2626' : '#b45309', fontSize: 18 }} />
                                <Typography variant="caption" color={isExpired ? '#dc2626' : '#92400e'} fontWeight={700}>
                                    {isExpired ? 'Reservation expired' : 'Reservation expires in:'}
                                </Typography>
                            </Stack>
                            {!isExpired && (
                                <Typography variant="h5" fontWeight={800} color="#b45309">{timeLeft}</Typography>
                            )}
                        </Box>
                    )}

                    {isExpired ? (
                        <Alert severity="warning" sx={{ borderRadius: 2, width: '100%' }}>
                            This reservation has expired. Please start a new booking.
                        </Alert>
                    ) : (
                        <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ display: 'block' }}>
                            Complete payment to confirm your locker. Link is valid for 30 minutes.
                        </Typography>
                    )}

                    <Stack direction="row" spacing={1} sx={{ width: '100%' }}>
                        {!isExpired && (
                            <Button
                                variant="contained"
                                startIcon={isRepaying
                                    ? <CircularProgress size={16} color="inherit" />
                                    : <PaymentIcon />
                                }
                                onClick={handleRepay}
                                disabled={isRepaying || isCancelling}
                                sx={{
                                    flex: 1,
                                    bgcolor: '#f59e0b',
                                    color: '#fff',
                                    borderRadius: 2,
                                    fontWeight: 800,
                                    textTransform: 'none',
                                    '&:hover': { bgcolor: '#d97706' },
                                }}
                            >
                                {isRepaying ? 'Loading...' : 'Repay'}
                            </Button>
                        )}
                        <Button
                            variant="outlined"
                            color="error"
                            onClick={handleCancel}
                            disabled={isCancelling || isRepaying}
                            startIcon={isCancelling ? <CircularProgress size={16} color="inherit" /> : null}
                            sx={{
                                flex: isExpired ? 1 : undefined,
                                borderRadius: 2,
                                fontWeight: 700,
                                textTransform: 'none',
                            }}
                        >
                            {isCancelling ? 'Cancelling...' : 'Cancel'}
                        </Button>
                    </Stack>
                </Stack>
            </Stack>
        </Paper>
    );
}

export function ActiveLockerCard({ locker: booking }: { locker: any }) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const {
        openLocker,
        closeLocker,
        cancelBookingDevice,
        extendBooking,
        isWorking,
        isLockerOpen,
        isCancelling,
        operationError,
    } = useDeviceOperation();

    const bookingId = booking.bookingId || booking.id;
    const stationId = booking.stationId || booking.station?.id;
    const lockerBoxId = booking.lockerBoxId || booking.lockerBox?.id;

    const isStuck = operationError?.result?.nextAction === 'CHANGE_LOCKER';

    const [isHidden, setIsHidden] = useState(() => {
        try {
            const canceledList = JSON.parse(localStorage.getItem('canceled_bookings') || '[]');
            return canceledList.includes(bookingId);
        } catch {
            return false;
        }
    });

    const [timeLeft, setTimeLeft] = useState(() =>
        booking.expectedEndTime ? "Calculating..." : "No end time"
    );
    const [timerStatus, setTimerStatus] = useState<"active" | "expired" | "heavilyOverdue" | "noTime">(() =>
        booking.expectedEndTime ? "active" : "noTime"
    );

    const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
    const [extendDate, setExtendDate] = useState("");
    const [extendTime, setExtendTime] = useState("");

    const { data: stationData, isLoading: isStationLoading } = useQuery({
        queryKey: ['station-details', stationId],
        queryFn: () => stationsApi.getStationById(stationId!),
        enabled: !!stationId && !booking.station?.address,
        staleTime: STALE_TIME_EXTENDED,
    });

    const { data: lockerData, isLoading: isLockerLoading } = useQuery({
        queryKey: ['locker-details', lockerBoxId],
        queryFn: () => lockersApi.getLockerById(lockerBoxId!),
        enabled: !!lockerBoxId && !booking.size,
        staleTime: STALE_TIME_EXTENDED,
    });

    useEffect(() => {
        if (!booking.expectedEndTime) return;
        const updateTimer = () => {
            const diff = new Date(booking.expectedEndTime).getTime() - Date.now();
            if (diff <= -(8 * 60 * 60 * 1000)) {
                setTimerStatus("heavilyOverdue");
                setTimeLeft("Expired");
            } else if (diff <= 0) {
                setTimerStatus("expired");
                setTimeLeft("Expired");
            } else {
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                setTimeLeft(`${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`);
                setTimerStatus("active");
            }
        };
        updateTimer();
        const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [booking.expectedEndTime]);

    if (booking.bookingStatus === 'PENDING' && booking.paymentStatus === 'PENDING') {
        return <ReservedLockerCard booking={booking} />;
    }

    if (isHidden) return null;

    const isLoading = isStationLoading || isLockerLoading;

    const address = booking.station?.address
        || stationData?.address
        || (isLoading ? null : `Station ID: ${stationId?.slice(-6).toUpperCase() ?? 'N/A'}`);

    const lockerCode = booking.code
        || booking.lockerBox?.code
        || lockerData?.code
        || (isLoading ? null : (lockerBoxId?.slice(-4).toUpperCase() || '???'));

    const size = booking.size || booking.lockerBox?.size || lockerData?.size || (isLoading ? null : 'N/A');

    const isActive = ['ACTIVE', 'PAID'].includes(booking.bookingStatus);

    const handleOpenExtendModal = () => {
        const currentEnd = booking.expectedEndTime ? new Date(booking.expectedEndTime) : new Date();
        currentEnd.setHours(currentEnd.getHours() + 1);
        setExtendDate(`${currentEnd.getFullYear()}-${String(currentEnd.getMonth() + 1).padStart(2, '0')}-${String(currentEnd.getDate()).padStart(2, '0')}`);
        setExtendTime(`${String(currentEnd.getHours()).padStart(2, '0')}:${String(currentEnd.getMinutes()).padStart(2, '0')}`);
        setIsExtendModalOpen(true);
    };

    const handleConfirmExtend = async () => {
        if (!extendDate || !extendTime) return;
        try {
            await extendBooking({ bookingId, endTime: new Date(`${extendDate}T${extendTime}:00`).toISOString() });
            setIsExtendModalOpen(false);
        } catch (error) {
            console.error("Failed to extend booking:", error);
            alert("Could not extend booking. Please try again.");
        }
    };

    const handleCancel = async () => {
        if (!bookingId) return;
        try {
            if (booking.bookingStatus === 'ACTIVE') {
                await apiClient.post(`/bookings/${bookingId}/end`);
            } else {
                await cancelBookingDevice(bookingId);
            }
            queryClient.setQueryData(["my-bookings"], (oldData: any) => {
                if (!oldData) return oldData;
                if (Array.isArray(oldData)) return oldData.filter((b: any) => (b.bookingId || b.id) !== bookingId);
                if (oldData.data && Array.isArray(oldData.data)) return { ...oldData, data: oldData.data.filter((b: any) => (b.bookingId || b.id) !== bookingId) };
                return oldData;
            });
            const canceledList = JSON.parse(localStorage.getItem('canceled_bookings') || '[]');
            if (!canceledList.includes(bookingId)) {
                canceledList.push(bookingId);
                localStorage.setItem('canceled_bookings', JSON.stringify(canceledList));
            }
            setIsHidden(true);
        } catch (error: any) {
            console.error("Cancel failed:", error?.response?.status, error?.message);
            alert(`Could not cancel booking: ${error?.message ?? "Unknown error"}`);
        }
    };

    const toggleLockerDevice = async () => {
        if (!bookingId || !stationId || !lockerBoxId) {
            alert("System error: Missing station or locker information.");
            return;
        }
        try {
            if (isLockerOpen) {
                await closeLocker({ bookingId, stationId, lockerBoxId });
            } else {
                await openLocker({ bookingId, stationId, lockerBoxId });
            }
        } catch (error) {
            console.error("Device error:", error);
        }
    };

    return (
        <>
            <Paper sx={{
                p: 4,
                borderRadius: 4,
                borderLeft: timerStatus === 'heavilyOverdue'
                    ? '10px solid #dc2626'
                    : timerStatus === 'expired'
                        ? '10px solid #f59e0b'
                        : '10px solid #2e7d32',
                mb: 2,
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                minHeight: '220px'
            }}>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={3}>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="h3" fontWeight={900}>
                            {lockerCode ? `Locker #${lockerCode}` : <Skeleton width={180} />}
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center" mt={1} mb={2}>
                            <LocationOnIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                            <Typography color="text.secondary" fontWeight={600}>
                                {address || <Skeleton width={250} />}
                            </Typography>
                        </Stack>
                        <Stack direction="row" spacing={1}>
                            <Chip
                                label={timerStatus === 'heavilyOverdue' ? "ITEMS MOVED" : booking.bookingStatus || "UNKNOWN"}
                                color={timerStatus === 'heavilyOverdue' ? "error" : isActive ? "success" : "warning"}
                                sx={{ fontWeight: 700 }}
                            />
                            {size ? (
                                <Chip label={`Size ${size}`} variant="outlined" sx={{ fontWeight: 700 }} />
                            ) : (
                                <Skeleton variant="rounded" width={80} height={32} sx={{ borderRadius: 4 }} />
                            )}
                        </Stack>
                    </Box>

                    <Stack alignItems={{ xs: 'stretch', md: 'flex-end' }} spacing={2} sx={{ minWidth: { md: '350px' } }}>
                        {isStuck ? (
                            <Box sx={{ p: 2.5, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 2, textAlign: 'center', width: '100%' }}>
                                <Typography variant="h4" mb={1}>😕</Typography>
                                <Typography variant="subtitle1" color="#991b1b" fontWeight={800} mb={0.5}>
                                    Oops, something went wrong!
                                </Typography>
                                <Typography variant="caption" color="#b91c1c" sx={{ display: 'block', mb: 2, lineHeight: 1.4 }}>
                                    We couldn't open this locker. Don't worry, we will find a more suitable locker for you.
                                </Typography>
                                <Button
                                    variant="contained"
                                    color="error"
                                    fullWidth
                                    onClick={() => navigate(`/stations/${stationId}`)}
                                    sx={{ borderRadius: 2, fontWeight: 800, textTransform: 'none' }}
                                >
                                    Book a new locker
                                </Button>
                            </Box>
                        ) : (
                            <>
                                {operationError && (
                                    <Alert severity="error" sx={{ borderRadius: 2, py: 0 }}>
                                        {operationError.errorMessage ?? "Operation failed. Please try again."}
                                    </Alert>
                                )}

                                {timerStatus === 'heavilyOverdue' && (
                                    <Alert severity="error" sx={{ borderRadius: 2 }}>
                                        <Typography variant="subtitle2" fontWeight={800} mb={0.5}>Items moved to Lost & Found</Typography>
                                        <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.4 }}>
                                            Your booking is more than 8 hours overdue. To retrieve your items, please contact support.
                                        </Typography>
                                    </Alert>
                                )}

                                {timerStatus === 'expired' && (
                                    <>
                                        <Box sx={{ p: 2, bgcolor: '#fffbeb', borderRadius: 2, textAlign: 'center', width: '100%' }}>
                                            <Typography variant="caption" color="text.secondary" fontWeight={700}>Expired</Typography>
                                            <Typography variant="h5" fontWeight={800} color="#b45309">Overdue</Typography>
                                        </Box>
                                        <Button
                                            variant="contained"
                                            color="warning"
                                            fullWidth
                                            onClick={() => alert("Redirecting to Pay Overdue Amount")}
                                            sx={{ borderRadius: 2, fontWeight: 800 }}
                                        >
                                            Pay Overdue Amount
                                        </Button>
                                    </>
                                )}

                                {timerStatus === 'active' && isActive && (
                                    <>
                                        <Box sx={{ p: 2, bgcolor: '#f0fdf4', borderRadius: 2, textAlign: 'center', width: '100%' }}>
                                            <Typography variant="caption" color="text.secondary" fontWeight={700}>Ends in:</Typography>
                                            <Typography variant="h5" fontWeight={800} color="#166534">{timeLeft}</Typography>
                                        </Box>

                                        <Button
                                            variant="contained"
                                            color={isLockerOpen ? "warning" : "success"}
                                            onClick={toggleLockerDevice}
                                            disabled={isWorking}
                                            startIcon={isWorking
                                                ? <CircularProgress size={20} color="inherit" />
                                                : (isLockerOpen ? <LockIcon /> : <LockOpenIcon />)
                                            }
                                            sx={{ borderRadius: 2, fontWeight: 800, textTransform: 'none', py: 1.5, fontSize: '1.1rem', width: '100%' }}
                                        >
                                            {isWorking ? "Connecting..." : (isLockerOpen ? "Close Locker" : "Open Locker")}
                                        </Button>

                                        <Stack direction="row" spacing={1} sx={{ width: '100%', pointerEvents: 'none' }}>
                                            <Button
                                                variant="contained"
                                                onClick={handleOpenExtendModal}
                                                disabled={isWorking}
                                                startIcon={<AccessTimeIcon />}
                                                sx={{
                                                    borderRadius: 2, fontWeight: 700, textTransform: 'none', flex: 1,
                                                    bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' },
                                                    pointerEvents: 'auto'
                                                }}
                                            >
                                                Extend
                                            </Button>
                                            <Button
                                                variant="outlined"
                                                color="error"
                                                onClick={handleCancel}
                                                disabled={isCancelling || isWorking}
                                                startIcon={isCancelling ? <CircularProgress size={16} color="inherit" /> : null}
                                                sx={{ borderRadius: 2, fontWeight: 700, textTransform: 'none', flex: 1, pointerEvents: 'auto' }}
                                            >
                                                {isCancelling ? "Cancelling..." : "Cancel"}
                                            </Button>
                                        </Stack>
                                    </>
                                )}
                            </>
                        )}
                    </Stack>
                </Stack>
            </Paper>

            <Dialog
                open={isExtendModalOpen}
                onClose={() => setIsExtendModalOpen(false)}
                PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
            >
                <DialogTitle sx={{ fontWeight: 800 }}>Extend Booking Time</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" mb={3}>
                        Select a new date and time to extend your current booking. Additional charges will apply.
                    </Typography>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                type="date"
                                label="New End Date"
                                value={extendDate}
                                onChange={(e) => setExtendDate(e.target.value)}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                type="time"
                                label="New End Time"
                                value={extendTime}
                                onChange={(e) => setExtendTime(e.target.value)}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setIsExtendModalOpen(false)} sx={{ color: '#64748b', fontWeight: 700 }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleConfirmExtend}
                        variant="contained"
                        disabled={isWorking}
                        sx={{ bgcolor: '#3b82f6', borderRadius: 2, fontWeight: 700 }}
                    >
                        {isWorking ? "Extending..." : "Confirm & Pay"}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

export function HistoryLockerCard({ booking }: { booking: any }) {
    const stationId = booking.stationId;
    const lockerBoxId = booking.lockerBoxId;

    const { data: stationData, isLoading: isStationLoading } = useQuery({
        queryKey: ['station-details', stationId],
        queryFn: () => stationsApi.getStationById(stationId!),
        enabled: !!stationId && !booking.station?.address,
        staleTime: STALE_TIME_EXTENDED,
    });

    const { data: lockerData, isLoading: isLockerLoading } = useQuery({
        queryKey: ['locker-details', lockerBoxId],
        queryFn: () => lockersApi.getLockerById(lockerBoxId!),
        enabled: !!lockerBoxId && !booking.size,
        staleTime: STALE_TIME_EXTENDED,
    });

    const isLoading = isStationLoading || isLockerLoading;

    const address = booking.station?.address || stationData?.address
        || (isLoading ? null : `Station ID: ${stationId?.slice(-6).toUpperCase() ?? 'N/A'}`);
    const lockerCode = booking.code || booking.lockerBox?.code || lockerData?.code
        || (isLoading ? null : (lockerBoxId?.slice(-4).toUpperCase() || '???'));
    const size = booking.size || booking.lockerBox?.size || lockerData?.size || (isLoading ? null : 'N/A');

    const statusLabel: Record<string, string> = {
        CANCELLED: 'Cancelled',
        COMPLETED: 'Completed',
        ENDED: 'Ended',
        EXPIRED: 'Expired',
        PAYMENT_CONFIRMED: 'Payment confirmed',
    };
    const label = statusLabel[booking.bookingStatus] ?? booking.bookingStatus ?? 'Unknown';

    const statusColor: Record<string, string> = {
        CANCELLED: '#dc2626',
        COMPLETED: '#16a34a',
        ENDED: '#16a34a',
        EXPIRED: '#b45309',
        PAYMENT_CONFIRMED: '#2563eb',
    };
    const borderColor = statusColor[booking.bookingStatus] ?? '#94a3b8';

    const endDateStr = booking.expectedEndTime
        ? new Date(booking.expectedEndTime).toLocaleDateString([], { dateStyle: 'medium' })
        : null;

    return (
        <Paper sx={{
            p: 3,
            borderRadius: 4,
            borderLeft: `6px solid ${borderColor}`,
            mb: 2,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            opacity: 0.85,
            minHeight: '80px'
        }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="h5" fontWeight={800} color="#1e293b">
                        {lockerCode ? `Locker #${lockerCode}` : <Skeleton width={120} />}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" mt={0.5}>
                        <LocationOnIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
                        <Typography variant="body2" color="text.secondary" fontWeight={600}>
                            {address || <Skeleton width={200} />}
                        </Typography>
                    </Stack>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Chip label={label.toUpperCase()} size="small"
                          sx={{ fontWeight: 700, bgcolor: `${borderColor}18`, color: borderColor, border: `1px solid ${borderColor}40` }}
                    />
                    {size ? (
                        <Chip label={`Size ${size}`} size="small" variant="outlined" sx={{ fontWeight: 700 }} />
                    ) : (
                        <Skeleton variant="rounded" width={60} height={24} sx={{ borderRadius: 4 }} />
                    )}
                    {endDateStr && (
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                            until {endDateStr}
                        </Typography>
                    )}
                </Stack>
            </Stack>
        </Paper>
    );
}
