import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    Paper, Box, Typography, Stack, Chip, Button, Alert, CircularProgress,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, Divider
} from "@mui/material";
import Grid from '@mui/material/Grid';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockIcon from '@mui/icons-material/Lock';
import PaymentIcon from '@mui/icons-material/Payment';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../api/apiClient.ts";
import { getPaymentUrl, removePaymentUrl } from "../../../hooks/useBooking.ts";
import { useDeviceOperation } from "../../../hooks/useDeviceOperation.ts";


function shortId(id: string | undefined) {
    if (!id) return 'N/A';
    return id.slice(-8).toUpperCase();
}


const cardBase = {
    borderRadius: '16px',
    mb: 2,
    overflow: 'hidden',
    transition: 'box-shadow 0.2s ease',
    '&:hover': { boxShadow: '0 8px 32px rgba(0,0,0,0.10)' },
};

// Строка с иконкой
function InfoRow({ icon, text, size = 'body2' }: { icon: React.ReactNode; text: string; size?: any }) {
    return (
        <Stack direction="row" spacing={1} alignItems="center">
            <Box sx={{ color: 'text.disabled', display: 'flex' }}>{icon}</Box>
            <Typography variant={size} color="text.secondary" fontWeight={500}>{text}</Typography>
        </Stack>
    );
}

// ---------------------------------------------------------------------------
// Reserved
// ---------------------------------------------------------------------------
function ReservedLockerCard({ booking }: { booking: any }) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const bookingId = booking.bookingId || booking.id;
    const stationId = booking.stationId;

    const [isHidden, setIsHidden] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [isRepaying, setIsRepaying] = useState(false);

    const expiresAt = booking.expiresAt ? new Date(booking.expiresAt).getTime() : null;
    const [timeLeft, setTimeLeft] = useState<string | null>(null);
    const [isExpired, setIsExpired] = useState(false);

    useEffect(() => {
        if (!expiresAt) return;
        const update = () => {
            const diff = expiresAt - Date.now();
            if (diff <= 0) { setIsExpired(true); setTimeLeft(null); }
            else {
                const m = Math.floor(diff / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`);
                setIsExpired(false);
            }
        };
        update();
        const t = setInterval(update, 1000);
        return () => clearInterval(t);
    }, [expiresAt]);

    const address = booking.stationAddress || `Station ${shortId(stationId)}`;

    const handleRepay = async () => {
        if (!bookingId) return;
        setIsRepaying(true);
        try {
            const paymentUrl = getPaymentUrl(bookingId);
            if (paymentUrl) { window.location.href = paymentUrl; }
            else if (stationId) { navigate(`/stations/${stationId}`); }
            else { alert('Payment link expired. Please start a new booking.'); }
        } finally { setIsRepaying(false); }
    };

    const handleCancel = async () => {
        if (!bookingId) return;
        setIsCancelling(true);
        try {
            const response = await apiClient.post(`/bookings/${bookingId}/cancel`);
            const data = response.data?.data;
            removePaymentUrl(bookingId);
            if (response.status === 202 && data?.operationId) {
                let attempts = 0;
                await new Promise<void>((resolve) => {
                    const interval = setInterval(async () => {
                        attempts++;
                        try {
                            const opRes = await apiClient.get(`/operations/${data.operationId}`);
                            const op = opRes.data?.data;
                            if (op?.status === 'SUCCESS' || op?.status === 'FAILED' || attempts >= 15) { clearInterval(interval); resolve(); }
                        } catch { if (attempts >= 15) { clearInterval(interval); resolve(); } }
                    }, 1500);
                });
            }
            queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
            setIsHidden(true);
        } catch (e: any) {
            alert(`Could not cancel: ${e?.response?.data?.error?.message ?? e?.message ?? 'Unknown error'}`);
        } finally { setIsCancelling(false); }
    };

    if (isHidden) return null;

    return (
        <Paper elevation={0} sx={{ ...cardBase, border: '1px solid #fde68a', bgcolor: '#fffdf5' }}>
            <Stack direction={{ xs: 'column', md: 'row' }}>

                <Box sx={{ width: { md: 6 }, height: { xs: 6, md: 'auto' }, bgcolor: '#f59e0b', flexShrink: 0, borderRadius: { xs: '16px 16px 0 0', md: '16px 0 0 16px' } }} />


                <Stack direction={{ xs: 'column', md: 'row' }} flex={1} justifyContent="space-between" spacing={0}>

                    <Box sx={{ p: 3, flex: 1 }}>
                        <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
                            <Chip label="AWAITING PAYMENT" size="small"
                                  sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 700, fontSize: '0.7rem', border: '1px solid #fde68a' }} />
                        </Stack>
                        <Typography variant="h6" fontWeight={800} color="#1e293b" mb={1}>
                            Station Reserved
                        </Typography>
                        <InfoRow icon={<LocationOnIcon sx={{ fontSize: 16 }} />} text={address} />
                        <Box sx={{ mt: 1.5 }}>
                            <Typography variant="caption" color="text.disabled" sx={{ letterSpacing: 1.5, textTransform: 'uppercase', fontSize: '0.65rem' }}>
                                Booking ref
                            </Typography>
                            <Typography variant="body2" fontWeight={700} color="#64748b" sx={{ fontFamily: 'monospace' }}>
                                #{shortId(bookingId)}
                            </Typography>
                        </Box>
                    </Box>

                    <Divider orientation={{ md: 'vertical' } as any} flexItem sx={{ borderStyle: 'dashed', borderColor: '#fde68a' }} />


                    <Box sx={{ p: 3, minWidth: { md: 260 } }}>
                        {timeLeft && !isExpired ? (
                            <Box sx={{ mb: 2, p: 2, bgcolor: '#fffbeb', borderRadius: 2, textAlign: 'center', border: '1px solid #fde68a' }}>
                                <Stack direction="row" justifyContent="center" alignItems="center" spacing={0.5} mb={0.5}>
                                    <HourglassTopIcon sx={{ fontSize: 14, color: '#b45309' }} />
                                    <Typography variant="caption" color="#92400e" fontWeight={600}>Expires in</Typography>
                                </Stack>
                                <Typography variant="h5" fontWeight={900} color="#b45309" sx={{ fontFamily: 'monospace' }}>
                                    {timeLeft}
                                </Typography>
                            </Box>
                        ) : isExpired ? (
                            <Alert severity="warning" sx={{ mb: 2, borderRadius: 2, fontSize: '0.8rem' }}>
                                Reservation expired. Please start a new booking.
                            </Alert>
                        ) : (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, lineHeight: 1.6 }}>
                                Complete payment to confirm your locker. Link is valid for 30 minutes.
                            </Typography>
                        )}
                        <Stack spacing={1}>
                            {!isExpired && (
                                <Button variant="contained" fullWidth onClick={handleRepay}
                                        disabled={isRepaying || isCancelling}
                                        startIcon={isRepaying ? <CircularProgress size={14} color="inherit" /> : <PaymentIcon sx={{ fontSize: 16 }} />}
                                        sx={{ bgcolor: '#f59e0b', borderRadius: 2, fontWeight: 800, textTransform: 'none', py: 1.2, fontSize: '0.9rem', '&:hover': { bgcolor: '#d97706' } }}>
                                    {isRepaying ? 'Loading...' : 'Pay Now'}
                                </Button>
                            )}
                            <Button variant="outlined" fullWidth color="error" onClick={handleCancel}
                                    disabled={isCancelling || isRepaying}
                                    startIcon={isCancelling ? <CircularProgress size={14} color="inherit" /> : null}
                                    sx={{ borderRadius: 2, fontWeight: 700, textTransform: 'none', py: 1, fontSize: '0.85rem' }}>
                                {isCancelling ? 'Cancelling...' : 'Cancel Reservation'}
                            </Button>
                        </Stack>
                    </Box>
                </Stack>
            </Stack>
        </Paper>
    );
}

// ---------------------------------------------------------------------------
// Active
// ---------------------------------------------------------------------------
export function ActiveLockerCard({ locker: booking }: { locker: any }) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const { openLocker, closeLocker, cancelBookingDevice, extendBooking, isWorking, isLockerOpen, isCancelling, operationError } = useDeviceOperation();

    const bookingId = booking.bookingId || booking.id;
    const stationId = booking.stationId;
    const lockerBoxId = booking.lockerBoxId;
    const isStuck = operationError?.result?.nextAction === 'CHANGE_LOCKER';

    const [isHidden, setIsHidden] = useState(() => {
        try { return JSON.parse(localStorage.getItem('canceled_bookings') || '[]').includes(bookingId); }
        catch { return false; }
    });

    const [timeLeft, setTimeLeft] = useState(() => booking.expectedEndTime ? "Calculating..." : "—");
    const [timerStatus, setTimerStatus] = useState<"active" | "expired" | "heavilyOverdue" | "noTime">(() =>
        booking.expectedEndTime ? "active" : "noTime"
    );

    const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
    const [extendDate, setExtendDate] = useState("");
    const [extendTime, setExtendTime] = useState("");

    useEffect(() => {
        if (!booking.expectedEndTime) return;
        const updateTimer = () => {
            const diff = new Date(booking.expectedEndTime).getTime() - Date.now();
            if (diff <= -(8 * 60 * 60 * 1000)) { setTimerStatus("heavilyOverdue"); setTimeLeft("—"); }
            else if (diff <= 0) { setTimerStatus("expired"); setTimeLeft("Expired"); }
            else {
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                setTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
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

    const lockerCode = booking.code || '—';
    const address = booking.stationAddress || `Station ${shortId(stationId)}`;
    const isActive = ['ACTIVE', 'PAID'].includes(booking.bookingStatus);

    const accentColor = timerStatus === 'heavilyOverdue' ? '#dc2626' : timerStatus === 'expired' ? '#f59e0b' : '#16a34a';

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
        } catch { alert("Could not extend booking. Please try again."); }
    };

    const handleCancel = async () => {
        if (!bookingId) return;
        try {
            if (booking.bookingStatus === 'ACTIVE') { await apiClient.post(`/bookings/${bookingId}/end`); }
            else { await cancelBookingDevice(bookingId); }
            queryClient.setQueryData(["my-bookings"], (oldData: any) => {
                if (!oldData) return oldData;
                if (Array.isArray(oldData)) return oldData.filter((b: any) => (b.bookingId || b.id) !== bookingId);
                if (oldData.data && Array.isArray(oldData.data)) return { ...oldData, data: oldData.data.filter((b: any) => (b.bookingId || b.id) !== bookingId) };
                return oldData;
            });
            const list = JSON.parse(localStorage.getItem('canceled_bookings') || '[]');
            if (!list.includes(bookingId)) { list.push(bookingId); localStorage.setItem('canceled_bookings', JSON.stringify(list)); }
            setIsHidden(true);
        } catch (error: any) { alert(`Could not cancel: ${error?.message ?? "Unknown error"}`); }
    };

    const toggleLockerDevice = async () => {
        if (!bookingId || !stationId || !lockerBoxId) { alert("System error: Missing information."); return; }
        try {
            if (isLockerOpen) { await closeLocker({ bookingId, stationId, lockerBoxId }); }
            else { await openLocker({ bookingId, stationId, lockerBoxId }); }
        } catch (error) { console.error("Device error:", error); }
    };

    return (
        <>
            <Paper elevation={0} sx={{ ...cardBase, border: `1px solid ${accentColor}28` }}>
                <Stack direction={{ xs: 'column', md: 'row' }}>
                    {/* Line color */}
                    <Box sx={{ width: { md: 6 }, height: { xs: 6, md: 'auto' }, bgcolor: accentColor, flexShrink: 0, borderRadius: { xs: '16px 16px 0 0', md: '16px 0 0 16px' } }} />

                    <Stack direction={{ xs: 'column', md: 'row' }} flex={1} justifyContent="space-between">

                        <Box sx={{ p: 3, flex: 1 }}>
                            <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
                                <Chip
                                    label={timerStatus === 'heavilyOverdue' ? 'ITEMS MOVED' : booking.bookingStatus}
                                    size="small"
                                    sx={{
                                        fontWeight: 700, fontSize: '0.7rem',
                                        bgcolor: isActive ? '#dcfce7' : '#fee2e2',
                                        color: isActive ? '#15803d' : '#dc2626',
                                        border: `1px solid ${isActive ? '#bbf7d0' : '#fecaca'}`,
                                    }}
                                />
                            </Stack>
                            <Typography variant="h4" fontWeight={900} color="#1e293b" mb={1}>
                                Locker #{lockerCode}
                            </Typography>
                            <InfoRow icon={<LocationOnIcon sx={{ fontSize: 16 }} />} text={address} />
                            <Box sx={{ mt: 1.5 }}>
                                <Typography variant="caption" color="text.disabled" sx={{ letterSpacing: 1.5, textTransform: 'uppercase', fontSize: '0.65rem' }}>
                                    Booking ref
                                </Typography>
                                <Typography variant="body2" fontWeight={700} color="#64748b" sx={{ fontFamily: 'monospace' }}>
                                    #{shortId(bookingId)}
                                </Typography>
                            </Box>
                        </Box>

                        <Divider orientation={{ md: 'vertical' } as any} flexItem sx={{ borderColor: `${accentColor}20` }} />


                        <Box sx={{ p: 3, minWidth: { md: 280 } }}>
                            {isStuck ? (
                                <Box sx={{ p: 2, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 2, textAlign: 'center' }}>
                                    <Typography variant="body2" color="#991b1b" fontWeight={800} mb={1}>😕 Locker unavailable</Typography>
                                    <Typography variant="caption" color="#b91c1c" sx={{ display: 'block', mb: 2 }}>
                                        We couldn't open this locker. Let us find you another one.
                                    </Typography>
                                    <Button variant="contained" color="error" fullWidth size="small"
                                            onClick={() => navigate(`/stations/${stationId}`)}
                                            sx={{ borderRadius: 2, fontWeight: 800, textTransform: 'none' }}>
                                        Book a new locker
                                    </Button>
                                </Box>
                            ) : (
                                <>
                                    {operationError && (
                                        <Alert severity="error" sx={{ borderRadius: 2, mb: 2, py: 0.5 }}>
                                            {operationError.errorMessage ?? "Operation failed. Please try again."}
                                        </Alert>
                                    )}
                                    {timerStatus === 'heavilyOverdue' && (
                                        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }}>
                                            <Typography variant="caption" fontWeight={800} display="block">Items moved to Lost & Found</Typography>
                                            <Typography variant="caption">More than 8 hours overdue. Contact support.</Typography>
                                        </Alert>
                                    )}
                                    {timerStatus === 'expired' && (
                                        <>
                                            <Box sx={{ p: 2, bgcolor: '#fffbeb', borderRadius: 2, textAlign: 'center', mb: 2, border: '1px solid #fde68a' }}>
                                                <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">Booking expired</Typography>
                                                <Typography variant="h6" fontWeight={900} color="#b45309">Overdue</Typography>
                                            </Box>
                                            <Button variant="contained" color="warning" fullWidth
                                                    onClick={() => alert("Redirecting to Pay Overdue Amount")}
                                                    sx={{ borderRadius: 2, fontWeight: 800, textTransform: 'none' }}>
                                                Pay Overdue Amount
                                            </Button>
                                        </>
                                    )}
                                    {timerStatus === 'active' && isActive && (
                                        <Stack spacing={1.5}>
                                            {/* Timer */}
                                            <Box sx={{ p: 2, bgcolor: '#f0fdf4', borderRadius: 2, border: '1px solid #bbf7d0', textAlign: 'center' }}>
                                                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}>
                                                    Time remaining
                                                </Typography>
                                                <Typography variant="h5" fontWeight={900} color="#15803d" sx={{ fontFamily: 'monospace', letterSpacing: 2 }}>
                                                    {timeLeft}
                                                </Typography>
                                            </Box>
                                            {/* Button Locker */}
                                            <Button variant="contained"
                                                    color={isLockerOpen ? "warning" : "success"}
                                                    onClick={toggleLockerDevice} disabled={isWorking}
                                                    startIcon={isWorking ? <CircularProgress size={16} color="inherit" /> : (isLockerOpen ? <LockIcon /> : <LockOpenIcon />)}
                                                    sx={{ borderRadius: 2, fontWeight: 800, textTransform: 'none', py: 1.3, fontSize: '0.95rem' }}>
                                                {isWorking ? "Connecting..." : (isLockerOpen ? "Close Locker" : "Open Locker")}
                                            </Button>
                                            {/* Extend + End */}
                                            <Stack direction="row" spacing={1}>
                                                <Button variant="outlined" onClick={handleOpenExtendModal} disabled={isWorking}
                                                        startIcon={<AccessTimeIcon sx={{ fontSize: 16 }} />}
                                                        sx={{ flex: 1, borderRadius: 2, fontWeight: 700, textTransform: 'none', borderColor: '#3b82f6', color: '#3b82f6', '&:hover': { bgcolor: '#eff6ff', borderColor: '#2563eb' } }}>
                                                    Extend
                                                </Button>
                                                <Button variant="outlined" color="error" onClick={handleCancel}
                                                        disabled={isCancelling || isWorking}
                                                        startIcon={isCancelling ? <CircularProgress size={14} color="inherit" /> : null}
                                                        sx={{ flex: 1, borderRadius: 2, fontWeight: 700, textTransform: 'none' }}>
                                                    {isCancelling ? "..." : (booking.bookingStatus === 'ACTIVE' ? "End" : "Cancel")}
                                                </Button>
                                            </Stack>
                                        </Stack>
                                    )}
                                </>
                            )}
                        </Box>
                    </Stack>
                </Stack>
            </Paper>

            <Dialog open={isExtendModalOpen} onClose={() => setIsExtendModalOpen(false)} PaperProps={{ sx: { borderRadius: 3, p: 1 } }}>
                <DialogTitle sx={{ fontWeight: 800 }}>Extend Booking</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" mb={3}>Choose a new end time. Additional charges apply.</Typography>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField type="date" label="New End Date" value={extendDate}
                                       onChange={(e) => setExtendDate(e.target.value)} fullWidth
                                       InputLabelProps={{ shrink: true }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField type="time" label="New End Time" value={extendTime}
                                       onChange={(e) => setExtendTime(e.target.value)} fullWidth
                                       InputLabelProps={{ shrink: true }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setIsExtendModalOpen(false)} sx={{ color: '#64748b', fontWeight: 700 }}>Cancel</Button>
                    <Button onClick={handleConfirmExtend} variant="contained" disabled={isWorking}
                            sx={{ bgcolor: '#3b82f6', borderRadius: 2, fontWeight: 700 }}>
                        {isWorking ? "Processing..." : "Confirm & Pay"}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

// ---------------------------------------------------------------------------
// Action Required
// ---------------------------------------------------------------------------
export function ActionRequiredLockerCard({ booking }: { booking: any }) {
    const [now] = useState(() => Date.now());
    const address = booking.stationAddress || `Station ${shortId(booking.stationId)}`;
    const endTime = booking.expectedEndTime ? new Date(booking.expectedEndTime).getTime() : null;
    const isHeavilyOverdue = endTime !== null && (now - endTime) > 8 * 60 * 60 * 1000;
    const endDateStr = booking.expectedEndTime
        ? new Date(booking.expectedEndTime).toLocaleDateString([], { dateStyle: 'medium' })
        : null;
    const accentColor = isHeavilyOverdue ? '#dc2626' : '#f59e0b';

    return (
        <Paper elevation={0} sx={{ ...cardBase, border: `1px solid ${accentColor}30` }}>
            <Stack direction={{ xs: 'column', md: 'row' }}>
                <Box sx={{ width: { md: 6 }, height: { xs: 6, md: 'auto' }, bgcolor: accentColor, flexShrink: 0, borderRadius: { xs: '16px 16px 0 0', md: '16px 0 0 16px' } }} />
                <Stack direction={{ xs: 'column', md: 'row' }} flex={1} justifyContent="space-between">
                    <Box sx={{ p: 3, flex: 1 }}>
                        <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
                            <Chip
                                label={isHeavilyOverdue ? 'ITEMS MOVED' : 'OVERDUE'}
                                size="small"
                                sx={{
                                    fontWeight: 700, fontSize: '0.7rem',
                                    bgcolor: isHeavilyOverdue ? '#fee2e2' : '#fef3c7',
                                    color: isHeavilyOverdue ? '#dc2626' : '#b45309',
                                    border: `1px solid ${isHeavilyOverdue ? '#fecaca' : '#fde68a'}`,
                                }}
                            />
                        </Stack>
                        <InfoRow icon={<LocationOnIcon sx={{ fontSize: 16 }} />} text={address} />
                        <Box sx={{ mt: 1.5 }}>
                            <Typography variant="caption" color="text.disabled" sx={{ letterSpacing: 1.5, textTransform: 'uppercase', fontSize: '0.65rem' }}>
                                Booking ref
                            </Typography>
                            <Typography variant="body2" fontWeight={700} color="#64748b" sx={{ fontFamily: 'monospace' }}>
                                #{shortId(booking.bookingId)}
                            </Typography>
                        </Box>
                        {endDateStr && (
                            <Stack direction="row" spacing={0.5} alignItems="center" mt={1}>
                                <CalendarTodayIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                                <Typography variant="caption" color="text.secondary">Expired {endDateStr}</Typography>
                            </Stack>
                        )}
                    </Box>

                    <Divider orientation={{ md: 'vertical' } as any} flexItem sx={{ borderColor: `${accentColor}20` }} />

                    <Box sx={{ p: 3, minWidth: { md: 260 }, display: 'flex', alignItems: 'center' }}>
                        {isHeavilyOverdue ? (
                            <Alert severity="error" sx={{ borderRadius: 2, width: '100%' }}>
                                <Typography variant="caption" fontWeight={800} display="block">Items moved to Lost & Found</Typography>
                                <Typography variant="caption">More than 8 hours overdue. Please contact support.</Typography>
                            </Alert>
                        ) : (
                            <Stack spacing={1.5} width="100%">
                                <Box sx={{ p: 2, bgcolor: '#fffbeb', borderRadius: 2, textAlign: 'center', border: '1px solid #fde68a' }}>
                                    <Typography variant="caption" color="#92400e" fontWeight={700} display="block">Payment required</Typography>
                                    <Typography variant="caption" color="#b45309">Your booking has expired</Typography>
                                </Box>
                                <Button variant="contained" color="warning" fullWidth
                                        onClick={() => alert("Redirecting to Pay Overdue Amount")}
                                        sx={{ borderRadius: 2, fontWeight: 800, textTransform: 'none' }}>
                                    Pay Overdue Amount
                                </Button>
                            </Stack>
                        )}
                    </Box>
                </Stack>
            </Stack>
        </Paper>
    );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
export function HistoryLockerCard({ booking }: { booking: any }) {
    const address = booking.stationAddress || `Station ${shortId(booking.stationId)}`;

    const statusLabel: Record<string, string> = {
        CANCELLED: 'Cancelled', COMPLETED: 'Completed', ENDED: 'Ended',
        EXPIRED: 'Expired', PAYMENT_CONFIRMED: 'Confirmed',
    };
    const label = statusLabel[booking.bookingStatus] ?? booking.bookingStatus ?? 'Unknown';

    const statusColor: Record<string, string> = {
        CANCELLED: '#94a3b8', COMPLETED: '#16a34a', ENDED: '#16a34a',
        EXPIRED: '#b45309', PAYMENT_CONFIRMED: '#2563eb',
    };
    const color = statusColor[booking.bookingStatus] ?? '#94a3b8';

    const endDateStr = booking.expectedEndTime
        ? new Date(booking.expectedEndTime).toLocaleDateString([], { dateStyle: 'medium' })
        : null;

    return (
        <Paper elevation={0} sx={{
            ...cardBase,
            border: '1px solid #f1f5f9',
            bgcolor: '#fafafa',
            opacity: 0.9,
            '&:hover': { opacity: 1, boxShadow: '0 4px 16px rgba(0,0,0,0.07)' },
        }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ p: 2.5 }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
                <Stack direction="row" spacing={2} alignItems="center" flex={1}>

                    <Box sx={{ width: 4, height: 40, bgcolor: color, borderRadius: 4, flexShrink: 0 }} />
                    <Box>
                        <Typography variant="body2" fontWeight={700} color="#64748b" sx={{ fontFamily: 'monospace', letterSpacing: 1 }}>
                            #{shortId(booking.bookingId)}
                        </Typography>
                        <InfoRow icon={<LocationOnIcon sx={{ fontSize: 14 }} />} text={address} size="caption" />
                    </Box>
                </Stack>
                <Stack direction="row" spacing={1.5} alignItems="center" flexShrink={0}>
                    {endDateStr && (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            <CalendarTodayIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                            <Typography variant="caption" color="text.disabled">{endDateStr}</Typography>
                        </Stack>
                    )}
                    <Chip label={label} size="small"
                          sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: `${color}15`, color, border: `1px solid ${color}30` }} />
                </Stack>
            </Stack>
        </Paper>
    );
}