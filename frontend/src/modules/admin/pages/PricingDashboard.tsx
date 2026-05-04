import { useState } from 'react';
import {
    Box, Typography, Paper, TextField, MenuItem,
    Button, CircularProgress, Dialog, DialogTitle,
    DialogContent, DialogActions, InputAdornment, Alert
} from '@mui/material';
import Grid from '@mui/material/Grid';
import EditIcon from '@mui/icons-material/Edit';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';

import { useCities } from '../../../hooks/useCities';
import { usePricing } from '../../../hooks/usePricing';
import type {LockerSize} from '../../../api/pricingApi';


const LOCKER_SIZES: { id: LockerSize; label: string; desc: string }[] = [
    { id: 'S', label: 'Small', desc: 'Standard small locker' },
    { id: 'M', label: 'Medium', desc: 'Fits backpacks & medium bags' },
    { id: 'L', label: 'Large', desc: 'Fits large suitcases' },
];

export function PricingDashboard() {
    const { cities, isLoading: isCitiesLoading } = useCities();
    console.log("Мои города:", cities);
    const [selectedCityId, setSelectedCityId] = useState('');

    const {
        pricingList,
        isLoading: isPricingLoading,
        createPrice,
        updatePrice,
        isMutating
    } = usePricing(selectedCityId || undefined);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingSize, setEditingSize] = useState<LockerSize | null>(null);
    const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
    const [priceInput, setPriceInput] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    const handleOpenDialog = (size: LockerSize, existingPriceId?: string, currentPrice?: number) => {
        setEditingSize(size);
        setEditingPriceId(existingPriceId || null);
        setPriceInput(currentPrice !== undefined ? currentPrice.toString() : '');
        setError(null);
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setEditingSize(null);
        setEditingPriceId(null);
        setPriceInput('');
    };

    const handleSavePrice = async () => {
        if (!selectedCityId || !editingSize) return;

        const priceNumber = parseFloat(priceInput);
        if (isNaN(priceNumber) || priceNumber < 0) {
            setError("Please enter a valid positive number.");
            return;
        }

        try {
            if (editingPriceId) {
                await updatePrice({
                    id: editingPriceId,
                    payload: { pricePerHour: priceNumber }
                });
            } else {
                await createPrice({
                    cityId: selectedCityId,
                    size: editingSize,
                    pricePerHour: priceNumber
                });
            }
            handleCloseDialog();
        } catch (err) {
            setError("Failed to save price. Please try again.");
            console.error(err);
        }
    };

    return (
        <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, border: '1px solid #e2e8f0', bgcolor: 'white' }}>
            <Typography variant="h5" fontWeight={800} mb={3} color="#1e293b">
                Pricing Management
            </Typography>

            <Box sx={{ mb: 4, maxWidth: 400 }}>
                <TextField
                    select
                    label="Select City"
                    value={selectedCityId}
                    onChange={(e) => setSelectedCityId(e.target.value)}
                    fullWidth
                    disabled={isCitiesLoading}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                >
                    <MenuItem value="">
                        <em>-- Choose a city --</em>
                    </MenuItem>
                    {cities?.map((city) => (
                        <MenuItem key={city.cityId} value={city.cityId}>
                            {city.name} ({city.code})
                        </MenuItem>
                    ))}
                </TextField>
            </Box>

            {!selectedCityId ? (
                <Box sx={{ p: 4, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 3, border: '1px dashed #cbd5e1' }}>
                    <Typography color="text.secondary">
                        Please select a city to view and manage locker prices.
                    </Typography>
                </Box>
            ) : isPricingLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <Grid container spacing={3}>
                    {LOCKER_SIZES.map((sizeConfig) => {
                        const existingPrice = pricingList.find(p => p.size === sizeConfig.id);

                        return (
                            <Grid size={{ xs: 12, md: 4 }} key={sizeConfig.id}>
                                <Paper
                                    elevation={0}
                                    sx={{
                                        p: 3,
                                        borderRadius: 3,
                                        border: '1px solid',
                                        borderColor: existingPrice ? '#bbf7d0' : '#e2e8f0',
                                        bgcolor: existingPrice ? '#f0fdf4' : '#f8fafc',
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column'
                                    }}
                                >
                                    <Box sx={{ mb: 'auto' }}>
                                        <Typography variant="h6" fontWeight={800} color="#1e293b">
                                            Size {sizeConfig.id}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" mb={2}>
                                            {sizeConfig.desc}
                                        </Typography>

                                        {existingPrice ? (
                                            <Typography variant="h4" fontWeight={900} color="#166534" mb={2}>
                                                ₪{existingPrice.pricePerHour.toFixed(2)}
                                                <Typography component="span" variant="body1" color="#15803d" fontWeight={500}>
                                                    /hr
                                                </Typography>
                                            </Typography>
                                        ) : (
                                            <Typography variant="body1" color="text.secondary" fontStyle="italic" mb={2}>
                                                Price not set
                                            </Typography>
                                        )}
                                    </Box>

                                    <Button
                                        variant={existingPrice ? "outlined" : "contained"}
                                        color={existingPrice ? "inherit" : "primary"}
                                        startIcon={existingPrice ? <EditIcon /> : <AddCircleOutlineIcon />}
                                        fullWidth
                                        onClick={() => handleOpenDialog(sizeConfig.id, existingPrice?.priceId, existingPrice?.pricePerHour)}
                                        sx={{
                                            borderRadius: 2,
                                            textTransform: 'none',
                                            fontWeight: 700,
                                            ...(existingPrice ? {} : { bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' } })
                                        }}
                                    >
                                        {existingPrice ? "Edit Price" : "Set Price"}
                                    </Button>
                                </Paper>
                            </Grid>
                        );
                    })}
                </Grid>
            )}

            <Dialog
                open={isDialogOpen}
                onClose={handleCloseDialog}
                PaperProps={{ sx: { borderRadius: 3, minWidth: { xs: '90vw', sm: 400 } } }}
            >
                <DialogTitle sx={{ fontWeight: 800, color: '#1e293b' }}>
                    {editingPriceId ? `Edit Price (Size ${editingSize})` : `Set New Price (Size ${editingSize})`}
                </DialogTitle>
                <DialogContent>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                            {error}
                        </Alert>
                    )}
                    <Typography variant="body2" color="text.secondary" mb={3} mt={1}>
                        Enter the hourly rate for this locker size in the selected city.
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        type="number"
                        label="Price per hour"
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        disabled={isMutating}
                        InputProps={{
                            startAdornment: <InputAdornment position="start">₪</InputAdornment>,
                        }}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 3, pt: 0 }}>
                    <Button
                        onClick={handleCloseDialog}
                        color="inherit"
                        sx={{ fontWeight: 600, textTransform: 'none' }}
                        disabled={isMutating}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSavePrice}
                        variant="contained"
                        disabled={isMutating || !priceInput}
                        sx={{
                            bgcolor: '#3b82f6',
                            color: 'white',
                            fontWeight: 700,
                            borderRadius: 2,
                            textTransform: 'none',
                            '&:hover': { bgcolor: '#2563eb' }
                        }}
                    >
                        {isMutating ? 'Saving...' : 'Save Price'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}