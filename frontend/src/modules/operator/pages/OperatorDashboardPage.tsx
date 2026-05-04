import {
    Box, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Button
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useStations } from "../../../hooks/useStations";

export default function OperatorDashboardPage() {
    const navigate = useNavigate();

    const {
        stations,
        isLoading
    } = useStations(); // ✅ теперь сам выберет operator endpoint

    if (isLoading) return <Typography>Loading...</Typography>;

    return (
        <Box sx={{ maxWidth: 1100, mx: "auto", mt: 4 }}>
            <Typography variant="h4" mb={3}>
                Operator Dashboard
            </Typography>

            <Paper sx={{ p: 3 }}>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>City</TableCell>
                                <TableCell>Address</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>

                        <TableBody>
                            {stations.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} align="center">
                                        No stations found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                stations.map((s) => (
                                    <TableRow key={s.stationId}>
                                        <TableCell>
                                            {typeof s.city === "string"
                                                ? s.city
                                                : s.city?.name}
                                        </TableCell>

                                        <TableCell>{s.address}</TableCell>

                                        <TableCell align="right">
                                            <Button
                                                variant="contained"
                                                onClick={() =>
                                                    navigate(`stations/${s.stationId}`)
                                                }
                                            >
                                                Manage Lockers
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Box>
    );
}