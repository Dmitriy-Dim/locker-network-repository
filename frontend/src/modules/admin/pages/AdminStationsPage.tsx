import {
    Container,
    Stack,
    Typography,
    Paper,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Chip,
    Button
} from "@mui/material";
import { useStations } from "../../../hooks/useStations";
import { AdminStationForm } from "./AdminStationForm";
import type { StationStatus } from "../../../types/lockers/lockers";

const BRAND_GREEN = '#6baf5c';

type CreateStationPayload = {
    city: string;
    address: string;
    latitude: number;
    longitude: number;
};

export default function AdminStationsPage() {
    const {
        stations,
        createStation,
        changeStationStatus
    } = useStations();

    const handleSave = async (data: CreateStationPayload) => {
        await createStation(data);
    };

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Stack spacing={4}>
                <Typography variant="h4" fontWeight={800}>Station Management</Typography>

                <AdminStationForm onSave={handleSave} />

                <Paper sx={{ border: '1px solid #e0e0e0', boxShadow: 'none', overflow: 'hidden' }}>
                    <Table>
                        <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>City</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Coordinates</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>

                        <TableBody>
                            {stations.map((st) => (
                                <TableRow key={st.stationId}>
                                    <TableCell sx={{ fontWeight: 600 }}>
                                        {typeof st.city === "string" ? st.city : st.city.name}
                                    </TableCell>

                                    <TableCell>
                                        <Chip
                                            label={st.status}
                                            size="small"
                                            color={
                                                st.status === "ACTIVE"
                                                    ? "success"
                                                    : st.status === "INACTIVE"
                                                        ? "warning"
                                                        : st.status === "MAINTENANCE"
                                                            ? "error"
                                                            : "default"
                                            }
                                        />
                                    </TableCell>

                                    <TableCell sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                                        {st.latitude.toFixed(4)}, {st.longitude.toFixed(4)}
                                    </TableCell>

                                    <TableCell align="right">
                                        {st.status === "ACTIVE" && (
                                            <Button
                                                variant="contained"
                                                size="small"
                                                sx={{ bgcolor: BRAND_GREEN, fontWeight: 700 }}
                                                onClick={() =>
                                                    changeStationStatus({
                                                        id: st.stationId,
                                                        status: "ACTIVE" as StationStatus
                                                    })
                                                }
                                            >
                                                Activate
                                            </Button>
                                        )}

                                        {st.status === "ACTIVE" && (
                                            <Button
                                                variant="contained"
                                                size="small"
                                                color="error"
                                                sx={{ fontWeight: 700 }}
                                                onClick={() =>
                                                    changeStationStatus({
                                                        id: st.stationId,
                                                        status: "MAINTENANCE" as StationStatus
                                                    })
                                                }
                                            >
                                                Maintenance
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            </Stack>
        </Container>
    );
}
