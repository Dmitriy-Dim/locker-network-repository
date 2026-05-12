import { useSearchParams, useNavigate } from "react-router-dom";
import { Box, Typography, Button, Paper, Stack } from "@mui/material";
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import { Paths } from "../../../config/paths/paths.ts";
import { getPaymentUrl } from "../../../hooks/useBooking.ts";

export function PaymentCancel() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const bookingId = searchParams.get('bookingId');

    const handleTryAgain = () => {
        if (bookingId) {
            const paymentUrl = getPaymentUrl(bookingId);
            if (paymentUrl) {
                window.location.href = paymentUrl;
            }
        }
    };

    return (
        <Box sx={{ pt: '100px', display: 'flex', justifyContent: 'center', px: 2 }}>
            <Paper sx={{ p: 6, borderRadius: 4, textAlign: 'center', maxWidth: 500, width: '100%' }}>
                <Stack alignItems="center" spacing={2}>
                    <CancelOutlinedIcon sx={{ fontSize: 80, color: '#f97316' }} />

                    <Typography variant="h4" fontWeight={900}>
                        Payment Cancelled
                    </Typography>

                    <Typography color="text.secondary">
                        You have cancelled the payment process. No charges were made, and your locker booking has not been confirmed.
                    </Typography>

                    {bookingId && (
                        <Box sx={{ bgcolor: '#fffbeb', p: 2, borderRadius: 2, width: '100%', mt: 2 }}>
                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                Booking Reference:
                            </Typography>
                            <Typography variant="body2" fontWeight={800} color="#b45309">
                                {bookingId}
                            </Typography>
                        </Box>
                    )}

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} width="100%" sx={{ mt: 4 }}>
                        <Button
                            variant="outlined"
                            fullWidth
                            onClick={() => navigate(Paths.USER)}
                            sx={{ fontWeight: 700, py: 1.5, borderRadius: 2, color: 'text.primary', borderColor: 'divider' }}
                        >
                            Return Home
                        </Button>
                        <Button
                            variant="contained"
                            fullWidth
                            onClick={handleTryAgain}
                            sx={{ bgcolor: '#f97316', fontWeight: 700, py: 1.5, borderRadius: 2, '&:hover': { bgcolor: '#ea580c' } }}
                        >
                            Try Again
                        </Button>
                    </Stack>
                </Stack>
            </Paper>
        </Box>
    );
}