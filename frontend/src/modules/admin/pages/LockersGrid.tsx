import React from 'react';
import Grid from '@mui/material/GridLegacy';
import { Paper, Typography, Box, Chip, Button } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { lockersApi } from '../../../api/lockersApi';
import { useLockers } from '../../../hooks/useLockers';
import { useAuth } from '../../../hooks/useAuth';
import type { LockerBox } from '../../../types/index';

interface LockersGridProps {
    stationId: string;
}

const getChipColor = (status: string): "success" | "warning" | "default" | "error" => {
    switch (status) {
        case "ACTIVE": return "success";
        case "MAINTENANCE":
        case "FAULTY": return "error";
        case "INACTIVE": return "default";
        default: return "default";
    }
};

const LockersGrid: React.FC<LockersGridProps> = ({ stationId }) => {
    const { data: lockers = [] } = useQuery<LockerBox[]>({
        queryKey: ['lockers', stationId],
        queryFn: async () => {
            const all = await lockersApi.getAdminLockers();
            return all.filter(l => l.stationId === stationId);
        }
    });

    const { user } = useAuth();
    const { activate, setMaintenance, setFaulty, setInactive, isUpdating } = useLockers();

    return (
        <Grid container spacing={2}>
            {lockers.map((locker) => (
                <Grid item xs={6} sm={4} md={3} key={locker.lockerBoxId}>
                    <Paper sx={{ p: 2 }}>
                        <Typography>Box #{locker.code}</Typography>

                        <Chip
                            label={locker.techStatus}
                            color={getChipColor(locker.techStatus)}
                            size="small"
                            sx={{ mt: 1 }}
                        />

                        <Box mt={2} display="flex" flexDirection="column" gap={1}>

                            {/* OPERATOR ONLY */}
                            {user?.role === "OPERATOR" && (
                                <>
                                    {locker.techStatus === "INACTIVE" && (
                                        <Button
                                            disabled={isUpdating}
                                            onClick={() => activate(locker.lockerBoxId)}
                                        >
                                            Activate
                                        </Button>
                                    )}

                                    {locker.techStatus === "ACTIVE" && (
                                        <>
                                            <Button
                                                disabled={isUpdating}
                                                onClick={() => setMaintenance(locker.lockerBoxId)}
                                            >
                                                Maintenance
                                            </Button>

                                            <Button
                                                disabled={isUpdating}
                                                onClick={() => setFaulty(locker.lockerBoxId)}
                                            >
                                                Faulty
                                            </Button>

                                            <Button
                                                disabled={isUpdating}
                                                onClick={() => setInactive(locker.lockerBoxId)}
                                            >
                                                Deactivate
                                            </Button>
                                        </>
                                    )}

                                    {(locker.techStatus === "MAINTENANCE" || locker.techStatus === "FAULTY") && (
                                        <Button
                                            disabled={isUpdating}
                                            onClick={() => activate(locker.lockerBoxId)}
                                        >
                                            Restore → Active
                                        </Button>
                                    )}
                                </>
                            )}

                            {/* ADMIN */}
                            {user?.role === "ADMIN" && (
                                <Typography variant="caption" color="text.secondary">
                                    Status managed by operator
                                </Typography>
                            )}
                        </Box>
                    </Paper>
                </Grid>
            ))}
        </Grid>
    );
};

export default LockersGrid;