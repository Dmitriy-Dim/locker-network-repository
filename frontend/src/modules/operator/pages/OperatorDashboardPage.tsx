import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Select,
    MenuItem,
    Button
} from "@mui/material";

import { useNavigate } from "react-router-dom";
import { useStations } from "../../../hooks/useStations";

export default function OperatorDashboardPage() {
    const navigate = useNavigate();
    const { operatorStations, changeStationStatusOperator } = useStations();

    const handleChange = (id: string, status: "ACTIVE" | "MAINTENANCE") => {
        changeStationStatusOperator({ id, status });
    };

    return (
        <Box sx={{ maxWidth: '1100px', mx: 'auto', mt: 4 }}>
            <Typography variant="h4" fontWeight={900} textAlign="center" mb={4}>
                Operator Dashboard
            </Typography>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>City</TableCell>
                            <TableCell>Address</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="right">Manage</TableCell>
                        </TableRow>
                    </TableHead>

                    <TableBody>
                        {operatorStations.map((s) => (
                            <TableRow key={s.stationId}>
                                <TableCell>
                                    {typeof s.city === "string"
                                        ? s.city
                                        : s.city?.name}
                                </TableCell>

                                <TableCell>{s.address}</TableCell>

                                <TableCell>
                                    <Select
                                        size="small"
                                        value={s.status === "INACTIVE" ? "ACTIVE" : s.status}
                                        onChange={(e) =>
                                            handleChange(
                                                s.stationId,
                                                e.target.value as "ACTIVE" | "MAINTENANCE"
                                            )
                                        }
                                    >
                                        <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                                        <MenuItem value="MAINTENANCE">MAINTENANCE</MenuItem>
                                    </Select>
                                </TableCell>

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
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}