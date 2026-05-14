import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    AppBar,
    Box,
    Button,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
    Typography
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import NotificationsIcon from '@mui/icons-material/Notifications';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PeopleIcon from '@mui/icons-material/People';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';

import { useAuth } from '../hooks/useAuth.ts';
import { ROLES } from '../config/roles/roles.ts';
import { Paths } from '../config/paths/paths.ts';

const DRAWER_WIDTH = 260;

interface MenuItem {
    text: string;
    path: string;
    icon: React.ReactNode;
}

export default function DashboardLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate(Paths.HOME);
    };

    const getMenuItems = (): MenuItem[] => {
        if (user?.role === ROLES.USER) {
            return [
                { text: 'Find Locker', path: Paths.USER, icon: <DashboardIcon /> },
                { text: 'My Bookings', path: `${Paths.USER}/my-bookings`, icon: <NotificationsIcon /> },
            ];
        }

        if (user?.role === ROLES.OPERATOR) {
            return [
                { text: 'Operator Panel', path: Paths.OPERATOR, icon: <DashboardIcon /> },
                { text: 'Active Alerts', path: Paths.ALERTS_OPERATOR, icon: <NotificationsIcon /> },
            ];
        }

        if (user?.role === ROLES.ADMIN) {
            return [
                { text: 'Dashboard', path: Paths.ADMIN, icon: <DashboardIcon /> },
                { text: 'Active Alerts', path: Paths.ALERTS_ADMIN, icon: <NotificationsIcon /> },
                { text: 'Users', path: Paths.USERS_ADMIN, icon: <PeopleIcon /> },
                { text: 'User Management', path: Paths.USER_MANAGEMENT_ADMIN, icon: <ManageAccountsIcon /> },
                { text: 'Pricing', path: Paths.PRICING_ADMIN, icon: <AttachMoneyIcon /> },
            ];
        }

        return [];
    };

    const drawerContent = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Box display="flex" justifyContent="center" mb={3}>
                    <img
                        src="/logo_app.png"
                        alt="logo"
                        width={200}
                        height={120}
                    />
                </Box>
            </Box>

            <Divider sx={{ mb: 2 }} />

            <List sx={{ px: 2, flexGrow: 1 }}>
                {getMenuItems().map((item) => {
                    const isActive = location.pathname === item.path;

                    return (
                        <ListItem key={item.text} disablePadding sx={{ mb: 1 }}>
                            <ListItemButton
                                onClick={() => navigate(item.path)}
                                sx={{
                                    borderRadius: 3,
                                    bgcolor: isActive ? '#6baf5c' : 'transparent',
                                    color: isActive ? 'white' : '#64748b',
                                    transition: 'all 0.2s',
                                    '&:hover': {
                                        bgcolor: isActive ? '#5a994c' : '#f1f5f9',
                                        color: isActive ? 'white' : '#1e293b',
                                    },
                                }}
                            >
                                <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                                    {item.icon}
                                </ListItemIcon>
                                <ListItemText
                                    primary={item.text}
                                    primaryTypographyProps={{ fontWeight: isActive ? 700 : 600 }}
                                />
                            </ListItemButton>
                        </ListItem>
                    );
                })}
            </List>
        </Box>
    );

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f8fafc' }}>
            <AppBar
                position="fixed"
                elevation={0}
                sx={{
                    width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
                    ml: { sm: `${DRAWER_WIDTH}px` },
                    bgcolor: 'white',
                    borderBottom: '1px solid #e2e8f0',
                    color: '#1e293b',
                }}
            >
                <Toolbar sx={{ justifyContent: 'space-between' }}>
                    <IconButton
                        color="inherit"
                        edge="start"
                        onClick={() => setMobileOpen(!mobileOpen)}
                        sx={{ mr: 2, display: { sm: 'none' } }}
                    >
                        <MenuIcon />
                    </IconButton>

                    <Box display="flex" alignItems="center" gap={2}>
                        <Typography
                            variant="body2"
                            fontWeight={700}
                            sx={{ color: '#64748b', display: { xs: 'none', sm: 'block' } }}
                        >
                            Role: <span style={{ color: '#6baf5c' }}>{user?.role}</span>
                        </Typography>
                    </Box>

                    <Box display="flex" alignItems="center" gap={3}>
                        <Typography
                            variant="body2"
                            fontWeight={600}
                            sx={{ display: { xs: 'none', sm: 'block' } }}
                        >
                            {user?.email}
                        </Typography>
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={handleLogout}
                            startIcon={<LogoutIcon />}
                            sx={{
                                borderRadius: 2,
                                textTransform: 'none',
                                fontWeight: 'bold',
                                color: '#e53935',
                                borderColor: '#e53935',
                                '&:hover': { bgcolor: '#ffebee', borderColor: '#d32f2f' },
                            }}
                        >
                            Logout
                        </Button>
                    </Box>
                </Toolbar>
            </AppBar>

            <Box
                component="nav"
                sx={{ width: { sm: DRAWER_WIDTH }, flexShrink: { sm: 0 } }}
            >
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    ModalProps={{ keepMounted: true }}
                    sx={{
                        display: { xs: 'block', sm: 'none' },
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
                    }}
                >
                    {drawerContent}
                </Drawer>

                <Drawer
                    variant="permanent"
                    sx={{
                        display: { xs: 'none', sm: 'block' },
                        '& .MuiDrawer-paper': {
                            boxSizing: 'border-box',
                            width: DRAWER_WIDTH,
                            borderRight: '1px solid #e2e8f0',
                        },
                    }}
                    open
                >
                    {drawerContent}
                </Drawer>
            </Box>

            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: { xs: 2, sm: 4 },
                    width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
                    mt: '64px',
                }}
            >
                <Box sx={{ maxWidth: '1100px', margin: '0 auto' }}>
                    <Outlet />
                </Box>
            </Box>
        </Box>
    );
}