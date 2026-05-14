import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
    Box, Typography, Paper, Chip, Select, MenuItem, FormControl,
    Stack, Button, ToggleButton, ToggleButtonGroup, Tooltip
} from '@mui/material';

import Grid from '@mui/material/GridLegacy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VisibilityIcon from '@mui/icons-material/Visibility';
import LockOpenIcon from '@mui/icons-material/LockOpen';

import { stationsApi } from '../../../api/stationsApi';
import { useLockers } from '../../../hooks/useLockers';

import { ExpiredLockerModal } from './ExpiredLockerModal';
import { BatchOperationsModal } from "./BatchOperationModal";

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

    const { changeLockerTechStatus, changeLockerStatus } = useLockers();

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

    const handleBusinessStatusChange = (lockerId: string, newStatus: LockerStatus) => {
        changeLockerStatus({ lockerBoxId: lockerId, status: newStatus });
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
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
                <Box>
                    <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
                        Back
                    </Button>

                    <Typography variant="h4">Station Details</Typography>
                    <Typography>{cityName}</Typography>
                    <Typography>{station?.address}</Typography>
                </Box>

                <Button
                    variant="contained"
                    startIcon={<LockOpenIcon />}
                    onClick={() => setBatchModalOpen(true)}
                >
                    Batch Operations
                </Button>
            </Stack>

            {expiredCount > 0 && (
                <Paper sx={{ p: 2, mb: 3, bgcolor: '#fff5f5' }}>
                    <Typography color="error">
                        {expiredCount} expired lockers require attention
                    </Typography>
                </Paper>
            )}

            <Paper sx={{ p: 2, mb: 3 }}>
                <Stack direction="row" spacing={2}>
                    <ToggleButtonGroup
                        value={statusFilter}
                        exclusive
                        onChange={(_, v) => v && setStatusFilter(v)}
                    >
                        {ALL_STATUSES.map((s) => (
                            <ToggleButton key={s} value={s}>{s}</ToggleButton>
                        ))}
                    </ToggleButtonGroup>

                    <ToggleButtonGroup
                        value={techFilter}
                        exclusive
                        onChange={(_, v) => v && setTechFilter(v)}
                    >
                        {ALL_TECH_STATUSES.map((s) => (
                            <ToggleButton key={s} value={s}>{s}</ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                </Stack>
            </Paper>

            <Grid container spacing={2}>
                {filtered.map((locker) => (
                    <Grid item xs={12} sm={6} md={3} key={locker.lockerBoxId}>
                        <Paper sx={{ p: 2 }}>
                            <Typography>Box #{locker.code}</Typography>

                            <Chip label={locker.status} color={getStatusChipColor(locker.status)} />
                            <Chip label={locker.techStatus} color={getTechChipColor(locker.techStatus)} />

                            <FormControl fullWidth>
                                <Select
                                    value={locker.techStatus}
                                    onChange={(e) =>
                                        handleTechChange(locker.lockerBoxId, e.target.value as LockerTechStatus)
                                    }
                                >
                                    <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                                    <MenuItem value="INACTIVE">INACTIVE</MenuItem>
                                    <MenuItem value="MAINTENANCE">MAINTENANCE</MenuItem>
                                    <MenuItem value="FAULTY">FAULTY</MenuItem>
                                </Select>
                            </FormControl>

                            {locker.status === 'EXPIRED' && (
                                <Button onClick={() => handleWatch(locker)}>
                                    Watch
                                </Button>
                            )}
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <ExpiredLockerModal
                open={singleModalOpen}
                locker={selectedLocker}
                station={{
                    stationId: stationId!,
                    address: station?.address ?? '',
                    city: cityName
                }}
                onClose={() => setSingleModalOpen(false)}
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