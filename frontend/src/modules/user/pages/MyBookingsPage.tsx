import { useState } from "react";
import {
    Box, Typography, Button, Stack, Paper, CircularProgress,
    Tabs, Tab, Badge
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import SentimentDissatisfiedIcon from '@mui/icons-material/SentimentDissatisfied';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HistoryIcon from '@mui/icons-material/History';
import PaymentIcon from '@mui/icons-material/Payment';
import { ActiveLockerCard, HistoryLockerCard } from "./ActiveLockerCard.tsx";
import { Paths } from "../../../config/paths/paths.ts";
import { useMyBookings } from "../../../hooks/useMyBookings.ts";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

export default function MyBookingsPage() {
    const navigate = useNavigate();
    const { data: bookings = [], isLoading } = useMyBookings();
    const [tabIndex, setTabIndex] = useState(0);
    const [now] = useState(() => Date.now());

    const safeBookings = Array.isArray(bookings) ? bookings : [];
    const activeBookings: any[] = [];
    const reservedBookings: any[] = [];   // PENDING + не оплачен
    const actionRequiredBookings: any[] = [];
    const historyBookings: any[] = [];

    safeBookings.forEach((b: any) => {
        if (b.bookingStatus === 'PENDING' && b.paymentStatus === 'PENDING') {
            reservedBookings.push(b);
            return;
        }

        if (b.bookingStatus === 'ACTIVE') {
            const endTime = b.expectedEndTime ? new Date(b.expectedEndTime).getTime() : null;
            const isTimeExpired = endTime !== null && endTime <= now;
            if (!isTimeExpired) {
                activeBookings.push(b);
                return;
            }
            const isExpiredLongAgo = endTime !== null && (now - endTime) > EIGHT_HOURS_MS;
            if (isExpiredLongAgo) {
                historyBookings.push(b);
            } else {
                actionRequiredBookings.push(b);
            }
            return;
        }

        if (b.bookingStatus === 'EXPIRED') {
            const endTime = b.expectedEndTime ? new Date(b.expectedEndTime).getTime() : null;
            const isExpiredLongAgo = endTime !== null && (now - endTime) > EIGHT_HOURS_MS;
            if (isExpiredLongAgo) {
                historyBookings.push(b);
            } else {
                actionRequiredBookings.push(b);
            }
            return;
        }
        if (b.bookingStatus !== 'ACTIVE') {
            historyBookings.push(b);
        }
    });

    const renderEmptyState = (type: 'active' | 'reserved' | 'action' | 'history') => {
        let message = "";
        let Icon = SentimentDissatisfiedIcon;
        let iconColor = "#94a3b8";

        if (type === 'active') {
            message = "No active bookings found";
        } else if (type === 'reserved') {
            message = "No pending payments.";
            Icon = PaymentIcon;
            iconColor = "#f59e0b";
        } else if (type === 'action') {
            message = "You're all caught up! No overdue bookings.";
            Icon = CheckCircleOutlineIcon;
            iconColor = "#22c55e";
        } else {
            message = "Your booking history is empty.";
            Icon = HistoryIcon;
        }

        return (
            <Paper sx={{
                p: 8, textAlign: 'center', borderRadius: 8, bgcolor: 'white',
                border: '2px dashed #e2e8f0', boxShadow: 'none', mt: 2
            }}>
                <Stack alignItems="center" spacing={3}>
                    <Icon sx={{ fontSize: 60, color: iconColor }} />
                    <Typography variant="h5" fontWeight={800} color="text.primary">
                        {message}
                    </Typography>
                    {type === 'active' && (
                        <Button
                            variant="contained"
                            size="large"
                            onClick={() => navigate(Paths.USER)}
                            sx={{ borderRadius: 4, px: 5, py: 1.5, fontWeight: 800, textTransform: 'none' }}
                        >
                            Find a Station
                        </Button>
                    )}
                </Stack>
            </Paper>
        );
    };

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 20 }}>
                <CircularProgress />
            </Box>
        );
    }

    const tabs = [
        { label: 'Active', list: activeBookings, emptyType: 'active' as const },
        { label: 'Reserved', list: reservedBookings, emptyType: 'reserved' as const, badge: reservedBookings.length > 0 },
        { label: 'Action Required', list: actionRequiredBookings, emptyType: 'action' as const, badge: actionRequiredBookings.length > 0 },
        { label: 'History', list: historyBookings, emptyType: 'history' as const },
    ];

    const currentTab = tabs[tabIndex];

    return (
        <Box sx={{ pt: '100px', px: 4, maxWidth: '900px', margin: '0 auto', pb: 10 }}>
            <Typography variant="h3" fontWeight={900} mb={3}>My Bookings</Typography>

            <Tabs
                value={tabIndex}
                onChange={(_, newValue) => setTabIndex(newValue)}
                sx={{ mb: 4, borderBottom: 1, borderColor: 'divider' }}
                TabIndicatorProps={{ sx: { height: 3, borderRadius: '3px 3px 0 0' } }}
            >
                {tabs.map((tab, i) => (
                    <Tab
                        key={i}
                        label={
                            tab.badge ? (
                                <Badge
                                    color={tab.label === 'Reserved' ? 'warning' : 'error'}
                                    variant="dot"
                                    sx={{ '& .MuiBadge-badge': { right: -5, top: 0 } }}
                                >
                                    {tab.label}
                                </Badge>
                            ) : tab.label
                        }
                        sx={{ fontWeight: 700, textTransform: 'none', fontSize: '1.05rem' }}
                    />
                ))}
            </Tabs>

            {currentTab.list.length > 0 ? (
                <Stack spacing={2}>
                    {currentTab.list.map((booking: any) =>
                        tabIndex === 3
                            ? <HistoryLockerCard key={booking.bookingId || booking.id} booking={booking} />
                            : <ActiveLockerCard key={booking.bookingId || booking.id} locker={booking} />
                    )}
                </Stack>
            ) : (
                renderEmptyState(currentTab.emptyType)
            )}
        </Box>
    );
}