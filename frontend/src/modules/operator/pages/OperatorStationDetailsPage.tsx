import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { stationsApi } from "../../../api/stationsApi";
import { useLockers } from "../../../hooks/useLockers";

import type { LockerStation, LockerTechStatus } from "../../../types/index";
import {
    Box,
    Typography,
    Paper,
    Chip,
    Select,
    MenuItem,
    FormControl
} from "@mui/material";
import Grid from "@mui/material/GridLegacy";

const getChipColor = (status: string) => {
    switch (status) {
        case "ACTIVE": return "success";
        case "MAINTENANCE":
        case "FAULTY": return "error";
        case "INACTIVE": return "default";
        default: return "default";
    }
};

export default function OperatorStationDetailsPage() {
    const { stationId } = useParams();
    const { changeLockerTechStatus } = useLockers();

    const { data: station } = useQuery<LockerStation>({
        queryKey: ["operator-station", stationId],
        queryFn: () => stationsApi.getOperatorStationById(stationId!),
        enabled: !!stationId
    });

    const lockers = station?.lockers ?? [];

    const handleChange = (lockerId: string, newStatus: LockerTechStatus) => {
        changeLockerTechStatus({
            lockerBoxId: lockerId,
            techStatus: newStatus
        });
    };

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4">Station Details</Typography>

            <Grid container spacing={2}>
                {lockers.map((locker) => (
                    <Grid item xs={12} sm={6} md={3} key={locker.lockerBoxId}>
                        <Paper sx={{ p: 2 }}>
                            <Typography>Box #{locker.code}</Typography>

                            <Chip
                                label={locker.techStatus}
                                color={getChipColor(locker.techStatus)}
                                size="small"
                                sx={{ mt: 1 }}
                            />

                            <FormControl fullWidth sx={{ mt: 2 }}>
                                <Select
                                    size="small"
                                    value={locker.techStatus}
                                    onChange={(e) =>
                                        handleChange(
                                            locker.lockerBoxId,
                                            e.target.value as LockerTechStatus
                                        )
                                    }
                                >
                                    <MenuItem value="INACTIVE">INACTIVE</MenuItem>
                                    <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                                    <MenuItem value="MAINTENANCE">MAINTENANCE</MenuItem>
                                    <MenuItem value="FAULTY">FAULTY</MenuItem>
                                </Select>
                            </FormControl>
                        </Paper>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
}