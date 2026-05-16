import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
    Box, Typography, Paper, Chip, Select, MenuItem, FormControl,
    Stack, Button, ToggleButton, ToggleButtonGroup, Tooltip
} from '@mui/material';

import Grid from '@mui/material/GridLegacy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import VisibilityIcon from '@mui/icons-material/Visibility';

import { stationsApi } from '../../../api/stationsApi';
import { useLockers } from '../../../hooks/useLockers';

import { ExpiredLockerModal } from './ExpiredLockerModal';
import { BatchOperationsModal } from './BatchOperationModal';

import type {
    LockerStation,
    LockerTechStatus,
    LockerStatus
} from '../../../types/index';

interface LockerBox {
    lockerBoxId: string;
    code: string;
    size: 'S' | 'M' | 'L';
    status: string;
    techStatus: string;
    pricePerHour?: string;
}

const getTechChipColor = (status: string): 'success' | 'error' | 'warning' | 'default' => {
    switch (status) {
        case 'ACTIVE': return 'success';
        case 'MAINTENANCE':
        case 'FAULTY': return 'error';
        case 'INACTIVE': return 'default';
        default: return 'default';
    }
};

const getStatusChipColor = (status: string): 'success' | 'error' | 'warning' | 'default' => {
    switch (status) {
        case 'AVAILABLE': return 'success';
        case 'EXPIRED': return 'error';
        case 'OCCUPIED': return 'warning';
        case 'RESERVED': return 'warning';
        default: return 'default';
    }
};

const ALL_STATUSES = ['ALL', 'AVAILABLE', 'RESERVED', 'OCCUPIED', 'EXPIRED'];
const ALL_TECH_STATUSES = ['ALL', 'ACTIVE', 'INACTIVE', 'MAINTENANCE', 'FAULTY'];

export default function OperatorStationDetailsPage() {
    const { stationId } = useParams<{ stationId: string }>();
    const navigate = useNavigate();
    const qc = useQueryClient();

    const { changeLockerTechStatus, changeLockerStatus: _changeLockerStatus } = useLockers();

    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [techFilter, setTechFilter] = useState<string>('ALL');

    const [selectedLocker, setSelectedLocker] = useState<LockerBox | null>(null);
    const [singleModalOpen, setSingleModalOpen] = useState(false);
    const [batchModalOpen, setBatchModalOpen] = useState(false);

    const { data: station, isLoading } = useQuery<LockerStation>({
        queryKey: ['operator-station', stationId],
        queryFn: () => stationsApi.getOperatorStationById(stationId!),
        enabled: !!stationId,
    });

    const lockers: LockerBox[] = (station?.lockers ?? []) as LockerBox[];

    const cityName =
        typeof station?.city === 'string'
            ? station.city
            : (station?.city as any)?.name ?? 'Unknown city';

    const filtered = lockers.filter((l) => {
        const statusMatch = statusFilter === 'ALL' || l.status === statusFilter;
        const techMatch = techFilter === 'ALL' || l.techStatus === techFilter;
        return statusMatch && techMatch;
    });

    const expiredCount = lockers.filter((l) => l.status === 'EXPIRED').length;

    const handleTechChange = (lockerId: string, newStatus: LockerTechStatus) => {
        changeLockerTechStatus({ lockerBoxId: lockerId, techStatus: newStatus });
    };

    // @ts-expect-error — preserved colleague's code, not yet wired to UI
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleBusinessStatusChange = (lockerId: string, newStatus: LockerStatus) => {
        _changeLockerStatus({ lockerBoxId: lockerId, status: newStatus });
    };

    const handleWatch = (locker: LockerBox) => {
        setSelectedLocker(locker);
        setSingleModalOpen(true);
    };

    const handleRefresh = () => {
        qc.invalidateQueries({ queryKey: ['operator-station', stationId] });
    };

    if (isLoading) {
        return (
            <Box sx={{ p: 3 }}>
                <Typography color="text.secondary">Loading…</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* ── header ── */}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
                <Box>
                    <Button
                        startIcon={<ArrowBackIcon />}
                        onClick={() => navigate(-1)}
                        sx={{ mb: 1, color: '#6baf5c', fontWeight: 700 }}
                    >
                        Back
                    </Button>
                    <Typography variant="h4" fontWeight={800}>Station Details</Typography>
                    <Typography variant="subtitle1" color="text.secondary">{cityName}</Typography>
                    <Typography variant="body2" color="text.secondary">{station?.address}</Typography>
                </Box>

                <Button
                    variant="contained"
                    startIcon={<LockOpenIcon />}
                    onClick={() => setBatchModalOpen(true)}
                    sx={{
                        bgcolor: '#e53e3e', fontWeight: 700, borderRadius: 2, mt: 1,
                        '&:hover': { bgcolor: '#c53030' }
                    }}
                >
                    Batch Operations
                </Button>
            </Stack>

            {/* ── expired banner ── */}
            {expiredCount > 0 && (
                <Paper
                    elevation={0}
                    sx={{
                        mb: 3, p: 2, borderRadius: 2,
                        bgcolor: '#fff5f5', border: '1px solid #fed7d7',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}
                >
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label={expiredCount} color="error" size="small" sx={{ fontWeight: 800 }} />
                        <Typography fontWeight={600} color="error.main">
                            expired {expiredCount === 1 ? 'locker requires' : 'lockers require'} attention
                        </Typography>
                    </Stack>
                    <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => setStatusFilter('EXPIRED')}
                        sx={{ fontWeight: 700, borderRadius: 2 }}
                    >
                        Show expired
                    </Button>
                </Paper>
            )}

            {/* ── filters ── */}
            <Paper
                elevation={0}
                sx={{
                    mb: 3, p: 2, borderRadius: 2,
                    border: '1px solid #e2e8f0', bgcolor: '#f8fafc'
                }}
            >
                <Stack spacing={1.5}>
                    <Box>
                        <Typography variant="caption" color="text.secondary" fontWeight={700} mb={0.5} display="block">
                            BOOKING STATUS
                        </Typography>
                        <ToggleButtonGroup
                            value={statusFilter}
                            exclusive
                            onChange={(_, v) => v && setStatusFilter(v)}
                            size="small"
                        >
                            {ALL_STATUSES.map((s) => (
                                <ToggleButton
                                    key={s}
                                    value={s}
                                    sx={{
                                        fontWeight: 700, fontSize: 11, px: 1.5,
                                        '&.Mui-selected': {
                                            bgcolor: s === 'EXPIRED' ? '#fed7d7' : '#dcfce7',
                                            color: s === 'EXPIRED' ? '#c53030' : '#276749',
                                        }
                                    }}
                                >
                                    {s}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                    </Box>

                    <Box>
                        <Typography variant="caption" color="text.secondary" fontWeight={700} mb={0.5} display="block">
                            TECH STATUS
                        </Typography>
                        <ToggleButtonGroup
                            value={techFilter}
                            exclusive
                            onChange={(_, v) => v && setTechFilter(v)}
                            size="small"
                        >
                            {ALL_TECH_STATUSES.map((s) => (
                                <ToggleButton
                                    key={s}
                                    value={s}
                                    sx={{
                                        fontWeight: 700, fontSize: 11, px: 1.5,
                                        '&.Mui-selected': {
                                            bgcolor: '#e0f2fe',
                                            color: '#0369a1',
                                        }
                                    }}
                                >
                                    {s}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                    </Box>

                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                            Showing {filtered.length} of {lockers.length} lockers
                        </Typography>
                        {(statusFilter !== 'ALL' || techFilter !== 'ALL') && (
                            <Button
                                size="small"
                                onClick={() => { setStatusFilter('ALL'); setTechFilter('ALL'); }}
                                sx={{ color: '#94a3b8', fontWeight: 700, fontSize: 11 }}
                            >
                                Clear filters
                            </Button>
                        )}
                    </Stack>
                </Stack>
            </Paper>

            {/* ── locker grid ── */}
            {filtered.length === 0 ? (
                <Typography color="text.secondary" textAlign="center" py={4}>
                    No lockers match the current filters.
                </Typography>
            ) : (
                <Grid container spacing={2}>
                    {filtered.map((locker) => {
                        const isExpired = locker.status === 'EXPIRED';
                        return (
                            <Grid item xs={12} sm={6} md={3} key={locker.lockerBoxId}>
                                <Paper
                                    sx={{
                                        p: 2, borderRadius: 2,
                                        border: isExpired ? '1.5px solid #fc8181' : '1px solid #e2e8f0',
                                        bgcolor: isExpired ? '#fff5f5' : '#fff',
                                        transition: 'box-shadow 0.15s',
                                        '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }
                                    }}
                                >
                                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1}>
                                        <Typography fontWeight={700}>Box #{locker.code}</Typography>
                                        <Chip label={locker.size} size="small" variant="outlined" sx={{ fontSize: 10, fontWeight: 700 }} />
                                    </Stack>

                                    <Chip
                                        label={locker.status || '—'}
                                        color={getStatusChipColor(locker.status)}
                                        size="small"
                                        sx={{ mb: 1, fontWeight: 700 }}
                                    />
                                    <Chip
                                        label={locker.techStatus}
                                        color={getTechChipColor(locker.techStatus)}
                                        size="small"
                                        variant="outlined"
                                        sx={{ mb: 2, ml: 0.5, fontWeight: 600 }}
                                    />

                                    <FormControl fullWidth sx={{ mb: isExpired ? 1.5 : 0 }}>
                                        <Select
                                            size="small"
                                            value={locker.techStatus}
                                            onChange={(e) =>
                                                handleTechChange(locker.lockerBoxId, e.target.value as LockerTechStatus)
                                            }
                                        >
                                            <MenuItem value="INACTIVE">INACTIVE</MenuItem>
                                            <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                                            <MenuItem value="MAINTENANCE">MAINTENANCE</MenuItem>
                                            <MenuItem value="FAULTY">FAULTY</MenuItem>
                                        </Select>
                                    </FormControl>

                                    {isExpired && (
                                        <Tooltip title="Open & close expired locker">
                                            <Button
                                                fullWidth
                                                variant="contained"
                                                size="small"
                                                startIcon={<VisibilityIcon />}
                                                onClick={() => handleWatch(locker)}
                                                sx={{
                                                    bgcolor: '#e53e3e', fontWeight: 700,
                                                    borderRadius: 2, fontSize: 12,
                                                    '&:hover': { bgcolor: '#c53030' }
                                                }}
                                            >
                                                Watch
                                            </Button>
                                        </Tooltip>
                                    )}
                                </Paper>
                            </Grid>
                        );
                    })}
                </Grid>
            )}

            <ExpiredLockerModal
                open={singleModalOpen}
                locker={selectedLocker}
                station={{ stationId: stationId!, address: station?.address ?? '', city: cityName }}
                onClose={() => { setSingleModalOpen(false); setSelectedLocker(null); }}
                onDone={handleRefresh}
            />

            <BatchOperationsModal
                open={batchModalOpen}
                stationId={stationId!}
                stationLabel={`${cityName} · ${station?.address ?? ''}`}
                onClose={() => setBatchModalOpen(false)}
                onDone={handleRefresh}
            />
        </Box>
    );
}