import { useState } from 'react';
import {
    Box, Typography, Button, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, Stack, Alert, MenuItem
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import { useStations } from '../../../hooks/useStations';
import { useCities } from '../../../hooks/useCities';
import { useAuth } from '../../../hooks/useAuth';
import { ROLES } from '../../../config/roles/roles.ts';
import { useNavigate } from 'react-router-dom';
import { CitiesManagerModal } from './../../shared/components/CitiesManagerModal';

export function AdminDashboardPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { stations, createStation, deleteStation } = useStations();
    const { cities, isLoading: citiesLoading } = useCities();

    const [open, setOpen] = useState(false);
    const [citiesModalOpen, setCitiesModalOpen] = useState(false);
    const [formData, setFormData] = useState({ cityCode: '', address: '', latitude: '', longitude: '' });
    const [error, setError] = useState<string | null>(null);

    const handleCreate = async () => {
        setError(null);

        if (!formData.cityCode || !formData.address || !formData.latitude || !formData.longitude) {
            setError("All fields are required.");
            return;
        }

        try {
            await createStation({
                city: formData.cityCode,
                address: formData.address.trim(),
                latitude: Number(formData.latitude),
                longitude: Number(formData.longitude)
            });

            setOpen(false);
            setFormData({ cityCode: '', address: '', latitude: '', longitude: '' });

        } catch (e: any) {
            console.error("Errors create:", e);
            let backendMessage = "Unknown error occurred";
            if (e.response?.data?.message) {
                try {
                    const parsedError = JSON.parse(e.response.data.message);
                    if (Array.isArray(parsedError) && parsedError[0]?.message) {
                        backendMessage = parsedError[0].message;
                    } else {
                        backendMessage = e.response.data.message;
                    }
                } catch {
                    backendMessage = e.response.data.message;
                }
            } else if (e.message) {
                backendMessage = e.message;
            }

            setError(`Failed to create: ${backendMessage}`);
        }
    };

    const handleClose = () => {
        setOpen(false);
        setFormData({ cityCode: '', address: '', latitude: '', longitude: '' });
        setError(null);
    };

    return (
        <Box sx={{ maxWidth: '1100px', mx: 'auto', mt: 4 }}>
            <Typography variant="h4" fontWeight={900} textAlign="center" mb={4}>System Overview</Typography>

            <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #e2e8f0' }}>
                <Box display="flex" justifyContent="space-between" mb={3}>
                    <Typography variant="h6" fontWeight={800}>Active Stations</Typography>

                    <Stack direction="row" spacing={2}>
                        {user?.role === ROLES.ADMIN && (
                            <>
                                <Button
                                    variant="outlined"
                                    startIcon={<LocationCityIcon />}
                                    onClick={() => setCitiesModalOpen(true)}
                                    sx={{
                                        color: '#6baf5c',
                                        borderColor: '#6baf5c',
                                        borderRadius: 2,
                                        fontWeight: 700,
                                        '&:hover': { borderColor: '#5a9a4d', bgcolor: 'rgba(107,175,92,0.08)' }
                                    }}
                                >
                                    ADD NEW CITY
                                </Button>

                                <Button
                                    variant="contained"
                                    startIcon={<AddIcon />}
                                    onClick={() => setOpen(true)}
                                    sx={{ bgcolor: '#6baf5c', borderRadius: 2, fontWeight: 700 }}
                                >
                                    ADD NEW STATION
                                </Button>
                            </>
                        )}
                    </Stack>
                </Box>

                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>City</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Address</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {stations.map((s) => (
                                <TableRow key={s.stationId}>
                                    <TableCell sx={{ fontWeight: 600 }}>
                                        {typeof s.city === 'string' ? s.city : (s.city?.name || 'N/A')}
                                    </TableCell>
                                    <TableCell>{s.address}</TableCell>
                                    <TableCell align="right">
                                        <Button
                                            size="small"
                                            variant="contained"
                                            onClick={() => navigate(`stations/${s.stationId}`)}
                                            sx={{ bgcolor: '#6baf5c', mr: 1, borderRadius: 2 }}
                                        >
                                            Manage
                                        </Button>

                                        {user?.role === ROLES.OPERATOR && (
                                            <IconButton onClick={() => deleteStation(s.stationId)} color="error">
                                                <DeleteIcon />
                                            </IconButton>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
                <DialogTitle sx={{ fontWeight: 800 }}>Create New Station</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {error && (
                            <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>
                        )}

                        <TextField
                            select
                            label="City"
                            fullWidth
                            value={formData.cityCode}
                            onChange={e => {
                                setFormData({ ...formData, cityCode: e.target.value });
                                if (error) setError(null);
                            }}
                            disabled={citiesLoading}
                            helperText={citiesLoading ? 'Loading cities...' : (!cities || cities.length === 0 ? 'No cities available. Add cities first.' : '')}
                        >
                            {cities?.map((city) => (
                                <MenuItem key={city.cityId} value={city.code}>
                                    {city.name} ({city.code})
                                </MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            label="Address"
                            fullWidth
                            value={formData.address}
                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                        />
                        <Stack direction="row" spacing={2}>
                            <TextField
                                label="Lat"
                                type="number"
                                inputProps={{ step: "any" }}
                                value={formData.latitude}
                                onChange={e => setFormData({ ...formData, latitude: e.target.value })}
                            />
                            <TextField
                                label="Lng"
                                type="number"
                                inputProps={{ step: "any" }}
                                value={formData.longitude}
                                onChange={e => setFormData({ ...formData, longitude: e.target.value })}
                            />
                        </Stack>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={handleClose} sx={{ color: '#64748b', fontWeight: 700 }}>CANCEL</Button>
                    <Button onClick={handleCreate} variant="contained" sx={{ bgcolor: '#6baf5c', fontWeight: 700 }}>CREATE</Button>
                </DialogActions>
            </Dialog>

            <CitiesManagerModal
                isOpen={citiesModalOpen}
                onClose={() => setCitiesModalOpen(false)}
            />
        </Box>
    );
}