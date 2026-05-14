import React, { useEffect, useState } from 'react';
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
    Chip,
    CircularProgress,
    Alert as MuiAlert
} from '@mui/material';

import {
    getAdminSecurityAlerts,
    getOperatorSecurityAlerts
} from '../../../api/alertsApi';

import type { SecurityAlert } from '../../../types/alerts/alerts';

import { useAuth } from '../../../hooks/useAuth';
import { ROLES } from '../../../config/roles/roles';

const AdminAlertsPage: React.FC = () => {
    const { user } = useAuth();

    const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchAlerts = async () => {
            try {
                setLoading(true);

                let data: SecurityAlert[] = [];

                if (user?.role === ROLES.ADMIN) {
                    data = await getAdminSecurityAlerts();
                }

                if (user?.role === ROLES.OPERATOR) {
                    data = await getOperatorSecurityAlerts();
                }

                setAlerts(data);
                setError(null);

            } catch (err) {
                console.error('Failed to fetch alerts:', err);
                setError('Failed to load alerts. Please try again later.');
            } finally {
                setLoading(false);
            }
        };

        fetchAlerts();
    }, [user]);

    const getSeverityColor = (
        severity: string
    ): "error" | "warning" | "info" | "success" | "default" => {

        switch (severity) {
            case 'CRITICAL':
                return 'error';

            case 'HIGH':
                return 'warning';

            case 'MEDIUM':
                return 'info';

            case 'LOW':
                return 'success';

            default:
                return 'default';
        }
    };

    if (loading) {
        return (
            <Box
                display="flex"
                justifyContent="center"
                alignItems="center"
                minHeight="200px"
            >
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box p={3}>
            <Typography
                variant="h4"
                component="h1"
                gutterBottom
            >
                Active Alerts
            </Typography>

            {error && (
                <MuiAlert severity="error" sx={{ mb: 3 }}>
                    {error}
                </MuiAlert>
            )}

            {!error && alerts.length === 0 ? (
                <Typography variant="body1">
                    No active alerts found.
                </Typography>
            ) : (
                <TableContainer component={Paper}>
                    <Table>

                        <TableHead>
                            <TableRow>
                                <TableCell>Timestamp</TableCell>
                                <TableCell>Severity</TableCell>
                                <TableCell>Event Type</TableCell>
                                <TableCell>Reason</TableCell>
                                <TableCell>Source</TableCell>
                                <TableCell>Environment</TableCell>
                            </TableRow>
                        </TableHead>

                        <TableBody>
                            {alerts.map((alert, index) => (
                                <TableRow key={alert.id || index}>

                                    <TableCell>
                                        {new Date(
                                            alert.timestamp || (alert as any)['@timestamp']
                                        ).toLocaleString()}
                                    </TableCell>

                                    <TableCell>
                                        <Chip
                                            label={alert.severity}
                                            color={getSeverityColor(alert.severity)}
                                            size="small"
                                        />
                                    </TableCell>

                                    <TableCell>
                                        {alert.eventType}
                                    </TableCell>

                                    <TableCell>
                                        {alert.reason}
                                    </TableCell>

                                    <TableCell>
                                        {alert.source}
                                    </TableCell>

                                    <TableCell>
                                        {alert.environment}
                                    </TableCell>

                                </TableRow>
                            ))}
                        </TableBody>

                    </Table>
                </TableContainer>
            )}
        </Box>
    );
};

export default AdminAlertsPage;