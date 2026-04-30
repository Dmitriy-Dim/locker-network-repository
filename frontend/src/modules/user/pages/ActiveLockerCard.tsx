import { useState, useEffect } from "react";
import { Paper, Box, Typography, Stack, Chip, Button, Alert, CircularProgress } from "@mui/material";
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockIcon from '@mui/icons-material/Lock';
import { useQuery, useQueryClient } from "@tanstack/react-query"; // Добавлен useQueryClient
import { stationsApi } from "../../../api/stationsApi.ts";
import { lockersApi } from "../../../api/lockersApi.ts";
import { useDeviceOperation } from "../../../hooks/useDeviceOperation.ts";

export function ActiveLockerCard({ locker: booking }: { locker: any }) {
    const queryClient = useQueryClient();
    const {
        openLocker,
        closeLocker,
        cancelBookingDevice,
        isWorking,
        isLockerOpen,
        isCancelling,
        operationError,
    } = useDeviceOperation();

    const bookingId = booking.bookingId || booking.id;


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

    const stationId = booking.stationId || booking.station?.id;
    const lockerBoxId = booking.lockerBoxId || booking.lockerBox?.id;

    const { data: stationData } = useQuery({
        queryKey: ['station-details', stationId],
        queryFn: () => stationsApi.getStationById(stationId!),
        enabled: !!stationId && !booking.station?.address,
    });

    const { data: lockerData } = useQuery({
        queryKey: ['locker-details', lockerBoxId],
        queryFn: () => lockersApi.getLockerById(lockerBoxId!),
        enabled: !!lockerBoxId && !booking.size,
    });

    const address = booking.station?.address
        || stationData?.address
        || `Station ID: ${stationId?.slice(-6).toUpperCase() ?? 'N/A'}`;
    const lockerCode = booking.code
        || booking.lockerBox?.code
        || lockerData?.code
        || lockerBoxId?.slice(-4).toUpperCase()
        || '???';
    const size = booking.size || booking.lockerBox?.size || lockerData?.size || 'N/A';

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
                setTimeLeft(
                    `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`
                );
                setTimerStatus("active");
            }
        };

        updateTimer();
        const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [booking.expectedEndTime]);

    const handleCancel = async () => {
        if (!bookingId) {
            console.error("Missing bookingId", booking);
            return;
        }
        try {
            await cancelBookingDevice(bookingId);
            queryClient.setQueryData(["my-bookings"], (oldData: any) => {
                if (!oldData) return oldData;
                if (Array.isArray(oldData)) {
                    return oldData.filter((b: any) => (b.bookingId || b.id) !== bookingId);
                }
                if (oldData.data && Array.isArray(oldData.data)) {
                    return { ...oldData, data: oldData.data.filter((b: any) => (b.bookingId || b.id) !== bookingId) };
                }
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
        try {
            if (isLockerOpen) {
                await closeLocker(bookingId);
            } else {
                await openLocker(bookingId);
            }
        } catch (error) {
            console.error("Device error:", error);
        }
    };

    if (isHidden) return null;

    const isActive = ['ACTIVE', 'PAID', 'PENDING'].includes(booking.bookingStatus);

    return (
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
        }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={3}>

                <Box>
                    <Typography variant="h3" fontWeight={900}>Locker #{lockerCode}</Typography>
                    <Stack direction="row" spacing={1} alignItems="center" mt={1} mb={2}>
                        <LocationOnIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                        <Typography color="text.secondary" fontWeight={600}>{address}</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                        <Chip
                            label={timerStatus === 'heavilyOverdue' ? "ITEMS MOVED" : booking.bookingStatus || "UNKNOWN"}
                            color={timerStatus === 'heavilyOverdue' ? "error" : isActive ? "success" : "warning"}
                            sx={{ fontWeight: 700 }}
                        />
                        <Chip label={`Size ${size}`} variant="outlined" sx={{ fontWeight: 700 }} />
                    </Stack>
                </Box>

                <Stack alignItems={{ xs: 'stretch', md: 'flex-end' }} spacing={2} sx={{ minWidth: { md: '350px' } }}>

                    {operationError && (
                        <Alert severity="error" sx={{ borderRadius: 2, py: 0 }}>
                            {operationError.errorMessage ?? "Operation failed. Please try again."}
                        </Alert>
                    )}

                    {/* СЦЕНАРИЙ 1: БОЛЕЕ 8 ЧАСОВ */}
                    {timerStatus === 'heavilyOverdue' && (
                        <Alert severity="error" sx={{ borderRadius: 2 }}>
                            <Typography variant="subtitle2" fontWeight={800} mb={0.5}>
                                Items moved to Lost & Found
                            </Typography>
                            <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.4 }}>
                                Your booking is more than 8 hours overdue. To retrieve your items, please contact support.
                            </Typography>
                        </Alert>
                    )}

                    {/* СЦЕНАРИЙ 2: ПРОСРОЧЕНО ДО 8 ЧАСОВ */}
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

                    {/* СЦЕНАРИЙ 3: АКТИВНАЯ БРОНЬ */}
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
                                    onClick={() => alert("Extend Modal")}
                                    startIcon={<AccessTimeIcon />}
                                    sx={{
                                        borderRadius: 2,
                                        fontWeight: 700,
                                        textTransform: 'none',
                                        flex: 1,
                                        bgcolor: '#3b82f6',
                                        '&:hover': { bgcolor: '#2563eb' },
                                        pointerEvents: 'auto'
                                    }}
                                >
                                    Extend
                                </Button>
                                <Button
                                    variant="outlined"
                                    color="error"
                                    onClick={handleCancel}
                                    disabled={isCancelling}
                                    startIcon={isCancelling ? <CircularProgress size={16} color="inherit" /> : null}
                                    sx={{ borderRadius: 2, fontWeight: 700, textTransform: 'none', flex: 1, pointerEvents: 'auto' }}
                                >
                                    {isCancelling ? "Cancelling..." : "Cancel"}
                                </Button>
                            </Stack>
                        </>
                    )}
                </Stack>
            </Stack>
        </Paper>
    );
}