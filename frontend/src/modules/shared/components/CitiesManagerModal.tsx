import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Box, Typography, Button, IconButton, TextField, Stack,
    Paper, List, ListItem, Alert, CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useCities } from '../../../hooks/useCities';
import type { City, CityPayload } from '../../../api/citiesApi';

interface CitiesManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function CitiesManagerModal({ isOpen, onClose }: CitiesManagerModalProps) {
    const { cities, isLoading, createCity, updateCity, deleteCity, isMutating } = useCities();

    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const resetForm = () => {
        setCode('');
        setName('');
        setEditingId(null);
        setError(null);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!code.trim() || !name.trim()) {
            setError('Both code and name are required.');
            return;
        }

        const payload: CityPayload = { code: code.trim(), name: name.trim() };

        try {
            if (editingId) {
                await updateCity({ id: editingId, payload });
            } else {
                await createCity(payload);
            }
            resetForm();
        } catch (e: any) {
            console.error('Error saving city:', e);
            setError(e?.response?.data?.message || e?.message || 'Failed to save city.');
        }
    };

    const handleEditClick = (city: City) => {
        setEditingId(city.cityId);
        setCode(city.code);
        setName(city.name);
        setError(null);
    };

    const handleDeleteClick = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this city?')) return;
        try {
            await deleteCity(id);
        } catch (e: any) {
            console.error('Error deleting city:', e);
            setError(e?.response?.data?.message || e?.message || 'Failed to delete city.');
        }
    };

    return (
        <Dialog open={isOpen} onClose={handleClose} fullWidth maxWidth="sm">
            <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Manage Cities
                <IconButton onClick={handleClose} size="small">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers sx={{ p: 0, position: 'relative' }}>
                <Paper
                    elevation={0}
                    component="form"
                    onSubmit={handleSubmit}
                    sx={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        p: 2.5,
                        borderRadius: 0,
                        borderBottom: '1px solid #e2e8f0',
                        bgcolor: '#f8fafc',
                        boxShadow: '0 4px 10px -4px rgba(0,0,0,0.05)'
                    }}
                >
                    <Typography variant="subtitle1" fontWeight={700} mb={2}>
                        {editingId ? 'Edit city' : 'Add new city'}
                    </Typography>

                    {error && (
                        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }}>
                            {error}
                        </Alert>
                    )}

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={2}>
                        <TextField
                            label="Code (e.g. TLV)"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            size="small"
                            fullWidth
                            required
                            inputProps={{ maxLength: 10 }}
                        />
                        <TextField
                            label="Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            size="small"
                            fullWidth
                            required
                        />
                    </Stack>

                    <Stack direction="row" spacing={1}>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={isMutating}
                            sx={{ bgcolor: '#6baf5c', borderRadius: 2, fontWeight: 700, '&:hover': { bgcolor: '#5a9a4d' } }}
                        >
                            {isMutating ? 'SAVING...' : (editingId ? 'UPDATE' : 'ADD')}
                        </Button>
                        {editingId && (
                            <Button
                                type="button"
                                onClick={resetForm}
                                sx={{ color: '#64748b', fontWeight: 700 }}
                            >
                                CANCEL
                            </Button>
                        )}
                    </Stack>
                </Paper>


                <Box sx={{ p: 2.5 }}>
                    <Typography variant="subtitle1" fontWeight={700} mb={1.5}>
                        Existing cities
                    </Typography>

                    {isLoading ? (
                        <Box display="flex" justifyContent="center" py={4}>
                            <CircularProgress size={28} sx={{ color: '#6baf5c' }} />
                        </Box>
                    ) : !cities || cities.length === 0 ? (
                        <Typography color="text.secondary" fontStyle="italic" textAlign="center" py={3}>
                            No cities yet.
                        </Typography>
                    ) : (
                        <List disablePadding>
                            {cities.map((city) => (
                                <ListItem
                                    key={city.cityId}
                                    sx={{
                                        px: 2,
                                        py: 1.5,
                                        mb: 1,
                                        borderRadius: 2,
                                        border: '1px solid #e2e8f0',
                                        bgcolor: '#fff',
                                        '&:hover': { bgcolor: '#f8fafc' },
                                        display: 'flex',
                                        justifyContent: 'space-between'
                                    }}
                                >
                                    <Box display="flex" alignItems="center" gap={1.5}>
                                        <Typography
                                            sx={{
                                                fontWeight: 700,
                                                color: '#6baf5c',
                                                bgcolor: 'rgba(107,175,92,0.1)',
                                                px: 1,
                                                py: 0.25,
                                                borderRadius: 1,
                                                fontSize: '0.8rem',
                                                minWidth: 50,
                                                textAlign: 'center'
                                            }}
                                        >
                                            {city.code}
                                        </Typography>
                                        <Typography fontWeight={500}>{city.name}</Typography>
                                    </Box>

                                    <Box>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleEditClick(city)}
                                            sx={{ color: '#6baf5c' }}
                                        >
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleDeleteClick(city.cityId)}
                                            color="error"
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Box>
                                </ListItem>
                            ))}
                        </List>
                    )}
                </Box>
            </DialogContent>

            <DialogActions sx={{ p: 2.5 }}>
                <Button onClick={handleClose} sx={{ color: '#64748b', fontWeight: 700 }}>
                    CLOSE
                </Button>
            </DialogActions>
        </Dialog>
    );
}