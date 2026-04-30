import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Box, Typography, Button, CircularProgress, Paper, Stack } from "@mui/material";
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useBooking } from "../../../hooks/useBooking.ts";
import { Paths } from "../../../config/paths/paths.ts";
import { useQuery } from "@tanstack/react-query";
import { lockersApi } from "../../../api/lockersApi.ts";

export function PaymentSuccess() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { pollOperation } = useBooking();

    const opId = searchParams.get('operationId');
    const bId = searchParams.get('bookingId');
    const finalId = opId || bId;

    const [status, setStatus] = useState<'loading' | 'success' | 'error'>(finalId ? 'loading' : 'error');
    const [lockerId, setLockerId] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(7);

    const polled = useRef(false);

    // 1. Поллинг для подтверждения оплаты
    useEffect(() => {
        if (!finalId) return;
        if (polled.current) return;
        polled.current = true;

        pollOperation(finalId, 'PAYMENT_CONFIRM')
            .then((op) => {
                console.log("Оплата подтверждена бэкендом!", op);
                const extractedLockerId = op.result?.lockerBoxId || op.lockerBoxId || op.payload?.lockerBoxId;
                setLockerId(extractedLockerId);
                setStatus('success');
            })
            .catch((err) => {
                console.error("Ошибка подтверждения оплаты:", err);
                setStatus('error');
            });
    }, [finalId, pollOperation]);

    // 2. Таймер для редиректа (теперь использует navigate, чтобы не выкидывало из системы)
    useEffect(() => {
        if (status === 'success') {
            const timer = setInterval(() => {
                setCountdown((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        navigate(`${Paths.USER}/my-bookings`);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [status, navigate]);

    // 3. Загрузка реального кода ячейки по ее ID
    const { data: lockerData } = useQuery({
        queryKey: ['locker-details', lockerId],
        queryFn: () => lockersApi.getLockerById(lockerId!),
        enabled: !!lockerId // Запрашиваем только когда получили ID от поллинга
    });

    // Формируем красивый номер ячейки для отображения
    const displayCode = lockerData?.code || (lockerId ? lockerId.slice(-4).toUpperCase() : 'READY');

    return (
        <Box sx={{ pt: '100px', display: 'flex', justifyContent: 'center', px: 2 }}>
            <Paper sx={{ p: 6, borderRadius: 4, textAlign: 'center', maxWidth: 500, width: '100%' }}>

                {status === 'loading' && (
                    <Stack alignItems="center" spacing={2}>
                        <CircularProgress size={60} sx={{ color: '#6baf5c' }} />
                        <Typography variant="h5" fontWeight={800}>Confirming your payment...</Typography>
                        <Typography color="text.secondary">Please wait, do not close this window.</Typography>
                    </Stack>
                )}

                {status === 'success' && (
                    <Stack alignItems="center" spacing={2}>
                        <CheckCircleOutlineIcon sx={{ fontSize: 80, color: '#6baf5c' }} />
                        <Typography variant="h4" fontWeight={900}>Payment Successful!</Typography>

                        <Box sx={{ bgcolor: '#f0fdf4', p: 3, borderRadius: 3, width: '100%', my: 2 }}>
                            <Typography color="text.secondary" fontWeight={600} mb={1}>
                                Your Locker Number is:
                            </Typography>
                            {/* Выводим реальный номер ячейки */}
                            <Typography variant="h3" fontWeight={900} color="#166534">
                                #{displayCode}
                            </Typography>
                        </Box>

                        <Typography color="text.secondary">
                            Redirecting to your bookings in <b>{countdown}</b> seconds...
                        </Typography>

                        <Button
                            variant="contained"
                            fullWidth
                            onClick={() => navigate(`${Paths.USER}/my-bookings`)}
                            sx={{ bgcolor: '#6baf5c', fontWeight: 700, py: 1.5, borderRadius: 2, mt: 2 }}
                        >
                            Go Now
                        </Button>
                    </Stack>
                )}

                {status === 'error' && (
                    <Stack alignItems="center" spacing={2}>
                        <ErrorOutlineIcon sx={{ fontSize: 80, color: '#ef4444' }} />
                        <Typography variant="h4" fontWeight={900}>Payment Error</Typography>
                        <Typography color="text.secondary">We couldn't confirm your payment.</Typography>
                        <Button
                            variant="outlined"
                            fullWidth
                            onClick={() => navigate(Paths.USER)}
                            sx={{ fontWeight: 700, py: 1.5, borderRadius: 2 }}
                        >
                            Return to Dashboard
                        </Button>
                    </Stack>
                )}
            </Paper>
        </Box>
    );
}