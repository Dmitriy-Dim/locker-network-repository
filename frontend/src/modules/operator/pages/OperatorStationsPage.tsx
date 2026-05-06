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
import { useStations } from "../../../hooks/useStations";

export default function OperatorStationsPage() {
    const {
        stations:operatorStations,
        isLoading,
        changeStationStatusOperator
    } = useStations();

    if (isLoading) return <Typography>Loading...</Typography>;

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" mb={3}>
                Stations (Operator)
            </Typography>

            <Grid container spacing={2}>
                {operatorStations.map((st) => (
                    <Grid item xs={12} md={6} key={st.stationId}>
                        <Paper sx={{ p: 3 }}>

                            {/* City + Address */}
                            <Typography fontWeight={700}>
                                {typeof st.city === "string"
                                    ? st.city
                                    : st.city?.name}
                            </Typography>

                            <Typography variant="body2" color="text.secondary">
                                {st.address}
                            </Typography>

                            {/* Status chip */}
                            <Chip
                                label={st.status}
                                sx={{ mt: 1 }}
                                color={
                                    st.status === "ACTIVE"
                                        ? "success"
                                        : st.status === "MAINTENANCE"
                                            ? "error"
                                            : "default"
                                }
                            />

                            {/* Status selector */}
                            <Box mt={2}>
                                <FormControl size="small" fullWidth>
                                    <Select
                                        value={
                                            st.status === "INACTIVE"
                                                ? "ACTIVE"
                                                : st.status
                                        }
                                        onChange={(e) =>
                                            changeStationStatusOperator({
                                                id: st.stationId,
                                                status: e.target.value as "ACTIVE" | "MAINTENANCE"
                                            })
                                        }
                                    >
                                        <MenuItem value="ACTIVE">
                                            ACTIVE
                                        </MenuItem>
                                        <MenuItem value="MAINTENANCE">
                                            MAINTENANCE
                                        </MenuItem>
                                    </Select>
                                </FormControl>
                            </Box>

                        </Paper>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
}