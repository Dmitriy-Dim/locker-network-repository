import { useState, useMemo } from "react";
import { Box, Typography, Stack, MenuItem, TextField, CircularProgress } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../hooks/useAuth.ts";
import { Paths } from "../../../config/paths/paths.ts";
import { useStations } from "../../../hooks/useStations.ts";

import { LocationsMapSection } from "../../user/pages/LocationsMapSection.tsx";

export function Location() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { stations, isLoading } = useStations({ publicOnly: true, limit: 1000 });
    const safeStations = Array.isArray(stations) ? stations : [];
    const activeStations = safeStations.filter(s => s.status === 'ACTIVE');

    const cities = useMemo(() => {
        const citySet = new Set(activeStations.map(s => typeof s.city === 'string' ? s.city : (s.city?.name || '')));
        return Array.from(citySet).filter(c => c !== '');
    }, [activeStations]);

    const [selectedCity, setSelectedCity] = useState<string>('');
    const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

    const displayedStations = useMemo(() => {
        if (!selectedCity) return activeStations;

        return activeStations.filter(s => {
            const cityName = typeof s.city === 'string' ? s.city : (s.city?.name || '');
            return cityName === selectedCity;
        });
    }, [activeStations, selectedCity]);

    const handleMapAction = (stationId: string) => {
        if (!user) {
            navigate(Paths.LOGIN);
        } else {
            navigate(`${Paths.USER}/stations/${stationId}`);
        }
    };

    if (isLoading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="90vh" bgcolor="#f8fafc">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ pt: '100px', pb: 8, px: { xs: 2, md: 4 }, maxWidth: '1400px', margin: '0 auto', minHeight: '92vh' }}>
            <Typography variant="h3" fontWeight={900} textAlign="center" mb={4} color="#1e293b">
                Find Your Locker
            </Typography>

            <Stack spacing={3} height="100%">
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                        select
                        label="1. Select City"
                        value={selectedCity}
                        onChange={(e) => {
                            setSelectedCity(e.target.value);
                            setSelectedStationId(null);
                        }}
                        sx={{ minWidth: 250, bgcolor: 'white', borderRadius: 2 }}
                    >
                        <MenuItem value="">
                            <em> All Cities</em>
                        </MenuItem>
                        {cities.length === 0 && <MenuItem disabled value="none">No active cities</MenuItem>}
                        {cities.map(city => (
                            <MenuItem key={city} value={city}>{city}</MenuItem>
                        ))}
                    </TextField>

                    <TextField
                        select
                        label="2. Select Address"
                        value={selectedStationId || ''}
                        onChange={(e) => setSelectedStationId(e.target.value)}
                        disabled={!selectedCity || displayedStations.length === 0}
                        sx={{ minWidth: 300, bgcolor: 'white', borderRadius: 2, flexGrow: 1 }}
                    >
                        <MenuItem value="">
                            <em>{selectedCity ? ` Show all in ${selectedCity}` : 'Select a city first'}</em>
                        </MenuItem>
                        {selectedCity && displayedStations.map(st => (
                            <MenuItem key={st.stationId} value={st.stationId}>
                                {st.address} ({st._count?.lockers || 0} boxes)
                            </MenuItem>
                        ))}
                    </TextField>
                </Stack>

                <Box sx={{
                    height: '65vh',
                    width: '100%',
                    borderRadius: 4,
                    overflow: 'hidden',
                    border: '2px solid #e2e8f0',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
                    bgcolor: 'white'
                }}>
                    <LocationsMapSection
                        stations={displayedStations}
                        selectedId={selectedStationId}
                        onMarkerAction={handleMapAction}
                        actionText={user ? "View Station" : "Login to Book"}
                    />
                </Box>
            </Stack>
        </Box>
    );
}