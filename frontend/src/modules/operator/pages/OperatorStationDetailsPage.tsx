import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { stationsApi } from "../../../api/stationsApi";
import { useLockers } from "../../../hooks/useLockers";

import type { LockerStation } from "../../../types/index";
import { Box, Typography, Paper, Chip, Button } from "@mui/material";
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
    const { activate } = useLockers();

    const { data: station } = useQuery<LockerStation>({
        queryKey: ["operator-station", stationId],
        queryFn: () => stationsApi.getOperatorStationById(stationId!),
        enabled: !!stationId
    });

    const lockers = station?.lockers ?? [];

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
                            />

                            {locker.techStatus !== "ACTIVE" && (
                                <Button onClick={() => activate(locker.lockerBoxId)}>
                                    Activate
                                </Button>
                            )}
                        </Paper>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
}