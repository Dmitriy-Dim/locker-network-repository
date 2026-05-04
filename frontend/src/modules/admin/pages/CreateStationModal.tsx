import React, { useState } from 'react';
import {
    Modal, Box, Typography, TextField, Button, MenuItem, Stack, IconButton, CircularProgress
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

import { stationsApi } from '../../../api/stationsApi';
import { useCities } from '../../../hooks/useCities';

interface CreateStationModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const modalStyle = {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 450,
    bgcolor: 'background.paper',
    boxShadow: 24,
    p: 4,
    borderRadius: 3,
};

const CreateStationModal: React.FC<CreateStationModalProps> = ({ open, onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        city: '',
        address: '',
        latitude: '',
        longitude: ''
    });
    const [loading, setLoading] = useState(false);

    const { cities, isLoading: isLoadingCities } = useCities();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await stationsApi.createStation({
                city: formData.city,
                address: formData.address,
                latitude: parseFloat(formData.latitude),
                longitude: parseFloat(formData.longitude)
            });
            onSuccess();
            onClose();
            setFormData({ city: '', address: '', latitude: '', longitude: '' });
        } catch (error) {
            console.error('Failed to create station:', error);
            alert('Error creating station. Check console for details.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={modalStyle}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                    <Typography variant="h6" fontWeight="bold">Add New Station</Typography>
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>

                <form onSubmit={handleSubmit}>
                    <Stack spacing={3}>
                        <TextField
                            select
                            label="City"
                            name="city"
                            value={formData.city}
                            onChange={handleChange}
                            required
                            fullWidth
                            disabled={isLoadingCities}
                            helperText={isLoadingCities ? 'Loading cities...' : ''}
                        >
                            {isLoadingCities ? (
                                <MenuItem disabled>
                                    <CircularProgress size={20} sx={{ mr: 1 }} /> Loading...
                                </MenuItem>
                            ) : (
                                (cities ?? []).map((city) => (
                                    <MenuItem key={city.cityId} value={city.code}>
                                        {city.name} ({city.code})
                                    </MenuItem>
                                ))
                            )}
                        </TextField>

                        <TextField
                            label="Address"
                            name="address"
                            value={formData.address}
                            onChange={handleChange}
                            placeholder="e.g. Dizengoff 10"
                            required
                            fullWidth
                        />

                        <Box display="flex" gap={2}>
                            <TextField
                                label="Latitude"
                                name="latitude"
                                type="number"
                                inputProps={{ step: 'any' }}
                                value={formData.latitude}
                                onChange={handleChange}
                                required
                            />
                            <TextField
                                label="Longitude"
                                name="longitude"
                                type="number"
                                inputProps={{ step: 'any' }}
                                value={formData.longitude}
                                onChange={handleChange}
                                required
                            />
                        </Box>

                        <Button
                            type="submit"
                            variant="contained"
                            color="success"
                            size="large"
                            disabled={loading || isLoadingCities}
                            fullWidth
                        >
                            {loading ? 'Creating...' : 'Create Station'}
                        </Button>
                    </Stack>
                </form>
            </Box>
        </Modal>
    );
};

export default CreateStationModal;