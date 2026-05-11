import { useState, useMemo } from "react";
import {
    Box, Typography, Button, Stack, Paper, CircularProgress,
    Tabs, Tab, Badge
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import SentimentDissatisfiedIcon from '@mui/icons-material/SentimentDissatisfied';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HistoryIcon from '@mui/icons-material/History';
import PaymentIcon from '@mui/icons-material/Payment';
import {ActionRequiredLockerCard, ActiveLockerCard, HistoryLockerCard} from "./ActiveLockerCard.tsx";
import { Paths } from "../../../config/paths/paths.ts";
import { useMyBookings } from "../../../hooks/useMyBookings.ts";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

export default function MyBookingsPage() {
    const navigate = useNavigate();
    const { data: bookings = [], isLoading } = useMyBookings();
    const [tabIndex, setTabIndex] = useState(0);
    const [now] = useState(() => Date.now());

    const { activeBookings, reservedBookings, actionRequiredBookings, historyBookings } = useMemo(() => {
        const safeBookings = Array.isArray(bookings) ? bookings : [];
        const active: any[] = [];
        const reserved: any[] = [];
        const action: any[] = [];
        const history: any[] = [];

        safeBookings.forEach((b: any) => {

            if (b.bookingStatus === 'PENDING' && b.paymentStatus === 'PENDING') {
                reserved.push(b);
                return;
            }

            if (b.bookingStatus === 'ACTIVE') {
                const endTime = b.expectedEndTime ? new Date(b.expectedEndTime).getTime() : null;
                const isTimeExpired = endTime !== null && endTime <= now;
                if (!isTimeExpired) {
                    active.push(b);
                } else {
                    action.push(b);
                }
                return;
            }

            if (b.bookingStatus === 'EXPIRED') {
                const endTime = b.expectedEndTime ? new Date(b.expectedEndTime).getTime() : null;
                const isExpiredLongAgo = endTime !== null && (now - endTime) > EIGHT_HOURS_MS;
                if (isExpiredLongAgo) {
                    history.push(b);
                } else {
                    action.push(b);
                }
                return;
            }
            history.push(b);
        });

        return {
            activeBookings: active,
            reservedBookings: reserved,
            actionRequiredBookings: action,
            historyBookings: history,
        };
    }, [bookings, now]);

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

    const tabs = useMemo(() => [
        { label: 'Active',          list: activeBookings,         emptyType: 'active'   as const },
        { label: 'Reserved',        list: reservedBookings,       emptyType: 'reserved' as const, badge: reservedBookings.length > 0 },
        { label: 'Action Required', list: actionRequiredBookings, emptyType: 'action'   as const, badge: actionRequiredBookings.length > 0 },
        { label: 'History',         list: historyBookings,        emptyType: 'history'  as const },
    ], [activeBookings, reservedBookings, actionRequiredBookings, historyBookings]);

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 20 }}>
                <CircularProgress />
            </Box>
        );
    }

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

            <Box sx={{ minHeight: '400px' }}>
                {currentTab.list.length > 0 ? (
                    <Stack spacing={2}>
                        {currentTab.list.map((booking: any) => {
                            const key = booking.bookingId || booking.id;
                            if (tabIndex === 2) return <ActionRequiredLockerCard key={key} booking={booking} />;
                            if (tabIndex === 3) return <HistoryLockerCard key={key} booking={booking} />;
                            return <ActiveLockerCard key={key} locker={booking} />;
                        })}
                    </Stack>
                ) : (
                    renderEmptyState(currentTab.emptyType)
                )}
            </Box>
        </Box>
    );
}