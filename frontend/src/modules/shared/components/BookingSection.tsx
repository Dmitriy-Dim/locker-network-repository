import { useState, useEffect } from 'react';
import {
    Box,
    Button,
    Typography,
    Alert,
    CircularProgress,
    TextField,
    MenuItem,
    Paper
} from '@mui/material';
import Grid from '@mui/material/Grid';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { useBooking } from '../../../hooks/useBooking';

interface BookingSectionProps {
    stationId: string;
    initialSize?: "S" | "M" | "L";
}

export function BookingSection({ stationId, initialSize = "M" }: BookingSectionProps) {
    const { startBookingFlow, isLoading, error } = useBooking();
    const [selectedSize, setSelectedSize] = useState(initialSize);
    const [prevInitialSize, setPrevInitialSize] = useState(initialSize);

    if (initialSize !== prevInitialSize) {
        setPrevInitialSize(initialSize);
        setSelectedSize(initialSize);
    }

    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date();
        d.setMinutes(d.getMinutes() + 6);

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });

    const [selectedTime, setSelectedTime] = useState(() => {
        const d = new Date();
        d.setMinutes(d.getMinutes() + 6);

        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    });

    const [currentTime, setCurrentTime] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(Date.now());
        }, 10000);
        return () => clearInterval(timer);
    }, []);

    const expectedEndTime = new Date(`${selectedDate}T${selectedTime}:00`);
    const diffMs = expectedEndTime.getTime() - currentTime;
    const MINIMUM_BOOKING_MS = 5 * 60 * 1000;

    let validationError: string | null = null;
    let durationText = '';

    if (diffMs <= 0) {
        validationError = 'Please select a future time.';
    } else if (diffMs < MINIMUM_BOOKING_MS - 60000) {
        validationError = 'Primary booking requires a minimum of 5 minutes.';
    } else {
        const h = Math.floor(diffMs / 3600000);
        const m = Math.floor((diffMs / 60000) % 60);
        const days = Math.floor(h / 24);
        const remainingH = h % 24;

        if (days > 0) {
            durationText = `Total duration: ${days} days, ${remainingH}h ${m}m`;
        } else {
            durationText = `Total duration: ${h}h ${m}m`;
        }
    }

    const handleBookNow = () => {
        if (validationError || !expectedEndTime) return;

        startBookingFlow({
            stationId: stationId,
            size: selectedSize as "S" | "M" | "L",
            expectedEndTime: expectedEndTime.toISOString(),
        });
    };

    return (
        <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, border: '1px solid #e2e8f0', bgcolor: 'white' }}>
            <Typography variant="h5" fontWeight={800} mb={3} color="#1e293b">
                Book a Locker
            </Typography>

            <Grid container spacing={3} direction="column">
                {(error || validationError) && (
                    <Grid size={12}>
                        <Alert severity="error" sx={{ borderRadius: 2 }}>
                            {error || validationError}
                        </Alert>
                    </Grid>
                )}

                <Grid size={12}>
                    <TextField
                        select
                        label="Locker Size"
                        value={selectedSize}
                        onChange={(e) => setSelectedSize(e.target.value as "S" | "M" | "L")}
                        disabled={isLoading}
                        fullWidth
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    >
                        <MenuItem value="S">Small (₪5.00 / hr)</MenuItem>
                        <MenuItem value="M">Medium (₪7.50 / hr)</MenuItem>
                        <MenuItem value="L">Large (₪10.00 / hr)</MenuItem>
                    </TextField>
                </Grid>

                <Grid container spacing={2} size={12}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                            type="date"
                            label="End Date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            disabled={isLoading}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                            type="time"
                            label="End Time"
                            value={selectedTime}
                            onChange={(e) => setSelectedTime(e.target.value)}
                            disabled={isLoading}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                        />
                    </Grid>
                </Grid>

                {durationText && !validationError && (
                    <Grid size={12}>
                        <Box sx={{ p: 2, bgcolor: '#f0fdf4', borderRadius: 2, border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <EventAvailableIcon sx={{ color: '#16a34a' }} />
                            <Box>
                                <Typography variant="body2" color="#166534" fontWeight={700}>
                                    Valid until {expectedEndTime.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                </Typography>
                                <Typography variant="caption" color="#15803d">
                                    {durationText}
                                </Typography>
                            </Box>
                        </Box>
                    </Grid>
                )}

                <Grid size={12} mt={1}>
                    {isLoading ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3, bgcolor: '#f8fafc', borderRadius: 3, border: '1px dashed #cbd5e1' }}>
                            <CircularProgress size={32} sx={{ color: '#6baf5c', mb: 2 }} />
                            <Typography variant="body2" fontWeight={700} color="#475569" textAlign="center">
                                Securing your locker... <br/>
                                <span style={{ fontWeight: 400 }}>Please wait, do not close this window.</span>
                            </Typography>
                        </Box>
                    ) : (
                        <Button
                            variant="contained"
                            size="large"
                            fullWidth
                            startIcon={<LockOutlinedIcon />}
                            onClick={handleBookNow}
                            disabled={!!validationError}
                            sx={{
                                bgcolor: '#6baf5c', py: 1.5, fontSize: '1.1rem', fontWeight: 700, borderRadius: 3,
                                boxShadow: '0 4px 12px rgba(107, 175, 92, 0.2)', textTransform: 'none',
                                '&:hover': { bgcolor: '#5a994c', boxShadow: '0 6px 16px rgba(107, 175, 92, 0.3)' },
                                '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' }
                            }}
                        >
                            Proceed to Payment
                        </Button>
                    )}
                </Grid>
            </Grid>
        </Paper>
    );
}