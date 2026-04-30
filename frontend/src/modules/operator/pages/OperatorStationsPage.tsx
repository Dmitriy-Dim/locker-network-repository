import { useQuery } from "@tanstack/react-query";
import { stationsApi } from "../../../api/stationsApi";
import { Box, Typography, Paper, Chip } from "@mui/material";
import Grid from "@mui/material/GridLegacy";
import type { LockerStation } from "../../../types/index";

export default function OperatorStationsPage() {

    const { data: stations = [], isLoading } = useQuery<LockerStation[]>({
        queryKey: ["operator-stations"],
        queryFn: stationsApi.getOperatorStations
    });

    if (isLoading) return <Typography>Loading...</Typography>;

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" fontWeight={900} mb={3}>
                Stations (Operator)
            </Typography>

            <Grid container spacing={2}>
                {stations.map((st) => (
                    <Grid item xs={12} md={6} key={st.stationId}>
                        <Paper sx={{ p: 3 }}>
                            <Typography variant="h6">
                                {st.address}
                            </Typography>

                            <Chip
                                label={st.status}
                                size="small"
                                sx={{ mt: 1 }}
                            />
                        </Paper>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
}