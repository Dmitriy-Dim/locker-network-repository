import {
    Box, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Select, MenuItem,
    Button, Stack, FormControl, InputLabel
} from '@mui/material';

import { useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useStations } from '../../../hooks/useStations';

export default function OperatorDashboardPage() {
    const navigate = useNavigate();
    const { stations: operatorStations, changeStationStatusOperator } = useStations();
    const [cityFilter, setCityFilter] = useState<string>('ALL');

    const handleChange = (id: string, status: 'ACTIVE' | 'MAINTENANCE') => {
        changeStationStatusOperator({ id, status });
    };

    // extract unique city names
    const cities = useMemo(() => {
        const set = new Set<string>();
        operatorStations.forEach((s) => {
            const name = typeof s.city === 'string' ? s.city : s.city?.name;
            if (name) set.add(name);
        });
        return Array.from(set).sort();
    }, [operatorStations]);

    const filtered = operatorStations.filter((s) => {
        if (cityFilter === 'ALL') return true;
        const name = typeof s.city === 'string' ? s.city : s.city?.name;
        return name === cityFilter;
    });

    return (
        <Box sx={{ maxWidth: '1100px', mx: 'auto', mt: 4 }}>
            <Typography variant="h4" fontWeight={900} textAlign="center" mb={4}>
                Operator Dashboard
            </Typography>

            {/* city filter */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel>Filter by City</InputLabel>
                    <Select
                        value={cityFilter}
                        label="Filter by City"
                        onChange={(e) => setCityFilter(e.target.value)}
                    >
                        <MenuItem value="ALL">All Cities ({operatorStations.length})</MenuItem>
                        {cities.map((city) => (
                            <MenuItem key={city} value={city}>
                                {city} ({operatorStations.filter((s) => {
                                const n = typeof s.city === 'string' ? s.city : s.city?.name;
                                return n === city;
                            }).length})
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <Typography variant="caption" color="text.secondary">
                    Showing {filtered.length} of {operatorStations.length} stations
                </Typography>
            </Stack>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>City</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Address</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>Manage</TableCell>
                        </TableRow>
                    </TableHead>

                    <TableBody>
                        {filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 4, color: '#94a3b8' }}>
                                    No stations found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((s) => (
                                <TableRow key={s.stationId}>
                                    <TableCell sx={{ fontWeight: 600 }}>
                                        {typeof s.city === 'string' ? s.city : s.city?.name}
                                    </TableCell>
                                    <TableCell>{s.address}</TableCell>
                                    <TableCell>
                                        <Select
                                            size="small"
                                            value={s.status}
                                            onChange={(e) =>
                                                handleChange(s.stationId, e.target.value as 'ACTIVE' | 'MAINTENANCE')
                                            }
                                        >
                                            {s.status === 'INACTIVE' && (
                                                <MenuItem value="INACTIVE">INACTIVE</MenuItem>
                                            )}
                                            <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                                            <MenuItem value="MAINTENANCE">MAINTENANCE</MenuItem>
                                        </Select>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Button
                                            variant="contained"
                                            onClick={() => navigate(`stations/${s.stationId}`)}
                                            sx={{ bgcolor: '#6baf5c', borderRadius: 2, fontWeight: 700 }}
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
        </Box>
    );
}