import { Box, Typography, Paper, Chip, Button } from "@mui/material";
import Grid from "@mui/material/GridLegacy";
import { useStations } from "../../../hooks/useStations";

export default function OperatorStationsPage() {
    const {
        stations,
        isLoading,
        changeStationStatus
    } = useStations();

    if (isLoading) return <Typography>Loading...</Typography>;

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" mb={3}>
                Stations (Operator)
            </Typography>

            <Grid container spacing={2}>
                {stations.map((st) => (
                    <Grid item xs={12} md={6} key={st.stationId}>
                        <Paper sx={{ p: 3 }}>
                            <Typography>{st.address}</Typography>

                            <Chip label={st.status} sx={{ mt: 1 }} />

                            <Box mt={2} display="flex" gap={1}>

                                {/* ACTIVATE */}
                                {st.status !== "ACTIVE" && (
                                    <Button
                                        variant="contained"
                                        onClick={() =>
                                            changeStationStatus?.({
                                                id: st.stationId,
                                                status: "ACTIVE"
                                            })
                                        }
                                    >
                                        Activate
                                    </Button>
                                )}

                                {/* MAINTENANCE */}
                                {st.status === "ACTIVE" && (
                                    <Button
                                        variant="contained"
                                        color="error"
                                        onClick={() =>
                                            changeStationStatus?.({
                                                id: st.stationId,
                                                status: "MAINTENANCE"
                                            })
                                        }
                                    >
                                        Maintenance
                                    </Button>
                                )}

                            </Box>
                        </Paper>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
}