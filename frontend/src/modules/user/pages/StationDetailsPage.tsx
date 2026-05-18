import { useState } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { stationsApi } from "../../../api/stationsApi";
import { lockersApi } from "../../../api/lockersApi";
import type { LockerBox, LockerStation } from '../../../types/index';
import {
    Box, Typography, Paper, Button, Divider, Stack,
    Dialog, DialogContent, IconButton
} from "@mui/material";
import Grid from "@mui/material/Grid";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import CloseIcon from '@mui/icons-material/Close';

import { BookingSection } from './../../shared/components/BookingSection';

export function StationDetailsPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    // 🔥 1. Добавляем стейт для запоминания размера
    const [selectedSize, setSelectedSize] = useState<"S" | "M" | "L">("M");

    const { data: station } = useQuery<LockerStation>({
        queryKey: ["user-station", id],
        queryFn: () => stationsApi.getStationById(id!),
        enabled: !!id
    });

    const { data: lockers = [] } = useQuery<LockerBox[]>({
        queryKey: ["user-lockers", id],
        queryFn: () => lockersApi.getLockers({ stationId: id })
    });

    const availableLockers = lockers.filter((l) => l.stationId === id && l.status === "AVAILABLE");

    const sizes: ("S" | "M" | "L")[] = ["S", "M", "L"];
    const groupedData = sizes.map(size => {
        const boxesOfSize = availableLockers.filter(l => l.size === size);
        if (boxesOfSize.length === 0) return null;
        const price = (boxesOfSize[0] as any).pricePerHour || "15.00";

        return { size, count: boxesOfSize.length, price };
    }).filter(Boolean);

    const cityName = typeof station?.city === 'string' ? station.city : (station?.city?.name || '');
    const stationLabel = cityName ? `${cityName} · ${station?.address ?? ''}` : (station?.address ?? '');

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: '900px', margin: '0 auto', pt: '100px' }}>
            <Button
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate(-1)}
                sx={{ mb: 4, color: '#64748b', fontWeight: 700 }}
            >
                BACK TO MAP
            </Button>

            <Box mb={4}>
                <Typography variant="h3" fontWeight={900}>
                    {stationLabel}
                </Typography>
            </Box>

            <Typography variant="h5" fontWeight={800} mb={3}>
                Available Locker Sizes
            </Typography>

            {groupedData.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 4 }}>
                    <Typography color="text.secondary" variant="h6">
                        No available lockers at this station right now.
                    </Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {groupedData.map((group) => (
                        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={group?.size}>
                            <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                <Inventory2OutlinedIcon sx={{ fontSize: 40, color: '#6baf5c', mb: 1 }} />

                                <Typography variant="h4" fontWeight={900}>
                                    Size {group?.size}
                                </Typography>

                                <Divider sx={{ my: 2 }} />

                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography color="text.secondary" fontWeight={600}>
                                        Available:
                                    </Typography>
                                    <Typography fontWeight={800} color="success.main" fontSize="1.1rem">
                                        {group?.count}
                                    </Typography>
                                </Stack>

                                <Stack direction="row" justifyContent="space-between" alignItems="center" mt={1}>
                                    <Typography color="text.secondary" fontWeight={600}>
                                        Price / hr:
                                    </Typography>
                                    <Typography fontWeight={800} fontSize="1.1rem">
                                        ₪{group?.price}
                                    </Typography>
                                </Stack>

                                <Button
                                    variant="contained"
                                    fullWidth
                                    // 🔥 2. Сначала ставим размер в стейт, потом открываем модалку
                                    onClick={() => {
                                        if (group?.size) setSelectedSize(group.size);
                                        setIsBookingModalOpen(true);
                                    }}
                                    sx={{
                                        mt: 3,
                                        borderRadius: 2,
                                        fontWeight: 700,
                                        bgcolor: '#6baf5c',
                                        textTransform: 'none',
                                        boxShadow: 'none',
                                        '&:hover': { bgcolor: '#5a994c', boxShadow: 'none' }
                                    }}
                                >
                                    Book Now
                                </Button>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            )}

            <Dialog
                open={isBookingModalOpen}
                onClose={() => setIsBookingModalOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: { borderRadius: 4, overflow: 'hidden' } }}
            >
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1, position: 'absolute', right: 0, top: 0, zIndex: 10 }}>
                    <IconButton onClick={() => setIsBookingModalOpen(false)}>
                        <CloseIcon />
                    </IconButton>
                </Box>
                <DialogContent sx={{ p: 0 }}>
                    {/* 🔥 3. Передаем выбранный размер внутрь секции бронирования */}
                    {id && <BookingSection stationId={id} initialSize={selectedSize} />}
                </DialogContent>
            </Dialog>

        </Box>
    );
}