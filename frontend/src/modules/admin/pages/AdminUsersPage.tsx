import { useState } from 'react';
import {
    Box, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, InputAdornment, Tooltip, Stack, Alert
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RestoreIcon from '@mui/icons-material/Restore';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import { useAdminUsers } from '../../../hooks/useAdminUsers';

type AdminUser = {
    userId: string;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    isDeleted?: boolean;
};

const roleColor = (role: string): 'default' | 'primary' | 'error' | 'warning' => {
    switch (role) {
        case 'ADMIN': return 'error';
        case 'OPERATOR': return 'warning';
        case 'USER': return 'primary';
        default: return 'default';
    }
};

export default function AdminUsersPage() {
    const { users, isLoading, isError, deleteUser, restoreUser, isDeleting, isRestoring } = useAdminUsers();

    const [search, setSearch] = useState('');
    const [confirmDialog, setConfirmDialog] = useState<{
        type: 'delete' | 'restore';
        user: AdminUser;
    } | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const filtered = users.filter((u: AdminUser) => {
        const q = search.toLowerCase();
        return (
            u.email.toLowerCase().includes(q) ||
            u.name?.toLowerCase().includes(q) ||
            u.userId.toLowerCase().includes(q)
        );
    });

    const handleConfirm = async () => {
        if (!confirmDialog) return;
        setActionError(null);
        try {
            if (confirmDialog.type === 'delete') {
                await deleteUser(confirmDialog.user.userId);
            } else {
                await restoreUser(confirmDialog.user.userId);
            }
            setConfirmDialog(null);
        } catch (e: any) {
            setActionError(
                e?.response?.data?.error?.message ?? e?.message ?? 'Operation failed'
            );
        }
    };

    return (
        <Box sx={{ maxWidth: '1100px', mx: 'auto', mt: 4, px: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1.5} mb={4}>
                <PersonIcon sx={{ fontSize: 32, color: '#6baf5c' }} />
                <Typography variant="h4" fontWeight={900}>
                    Users
                </Typography>
            </Stack>

            {isError && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                    Failed to load users.
                </Alert>
            )}

            {/* search */}
            <Paper
                elevation={0}
                sx={{ p: 2, mb: 3, borderRadius: 2, border: '1px solid #e2e8f0' }}
            >
                <TextField
                    placeholder="Search by email, name or ID…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    size="small"
                    fullWidth
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon sx={{ color: '#94a3b8' }} />
                            </InputAdornment>
                        ),
                    }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
                <Typography variant="caption" color="text.secondary" mt={1} display="block">
                    {filtered.length} of {users.length} users
                </Typography>
            </Paper>

            {/* table */}
            <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#f8fafc' }}>
                                <TableCell sx={{ fontWeight: 700 }}>ID</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Phone</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: '#94a3b8' }}>
                                        Loading…
                                    </TableCell>
                                </TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: '#94a3b8' }}>
                                        No users found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filtered.map((u: AdminUser) => (
                                    <TableRow
                                        key={u.userId}
                                        sx={{
                                            opacity: u.isDeleted ? 0.5 : 1,
                                            bgcolor: u.isDeleted ? '#f8fafc' : 'inherit',
                                            '&:hover': { bgcolor: '#f1f5f9' }
                                        }}
                                    >
                                        <TableCell>
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    fontFamily: 'monospace',
                                                    bgcolor: '#f1f5f9',
                                                    px: 0.8, py: 0.3, borderRadius: 1
                                                }}
                                            >
                                                {u.userId.slice(0, 8)}…
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>
                                            {u.name ?? '—'}
                                        </TableCell>
                                        <TableCell>{u.email}</TableCell>
                                        <TableCell>{u.phone ?? '—'}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={u.role}
                                                size="small"
                                                color={roleColor(u.role)}
                                                sx={{ fontWeight: 700 }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={u.isDeleted ? 'Deleted' : 'Active'}
                                                size="small"
                                                color={u.isDeleted ? 'default' : 'success'}
                                                sx={{ fontWeight: 600 }}
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            {u.isDeleted ? (
                                                <Tooltip title="Restore user">
                                                    <IconButton
                                                        size="small"
                                                        color="success"
                                                        onClick={() => setConfirmDialog({ type: 'restore', user: u })}
                                                    >
                                                        <RestoreIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            ) : (
                                                <Tooltip title="Delete user">
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() => setConfirmDialog({ type: 'delete', user: u })}
                                                    >
                                                        <DeleteOutlineIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            {/* confirm dialog */}
            <Dialog
                open={!!confirmDialog}
                onClose={() => { setConfirmDialog(null); setActionError(null); }}
                maxWidth="xs"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ fontWeight: 800 }}>
                    {confirmDialog?.type === 'delete' ? 'Delete User' : 'Restore User'}
                </DialogTitle>
                <DialogContent>
                    {actionError && (
                        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{actionError}</Alert>
                    )}
                    <Typography>
                        {confirmDialog?.type === 'delete'
                            ? <>Are you sure you want to delete <strong>{confirmDialog.user.email}</strong>?</>
                            : <>Restore access for <strong>{confirmDialog?.user.email}</strong>?</>
                        }
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 3, gap: 1 }}>
                    <Button
                        onClick={() => { setConfirmDialog(null); setActionError(null); }}
                        sx={{ color: '#64748b', fontWeight: 700 }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleConfirm}
                        disabled={isDeleting || isRestoring}
                        sx={{
                            bgcolor: confirmDialog?.type === 'delete' ? '#e53e3e' : '#6baf5c',
                            fontWeight: 700, borderRadius: 2,
                            '&:hover': {
                                bgcolor: confirmDialog?.type === 'delete' ? '#c53030' : '#5a9a4d'
                            }
                        }}
                    >
                        {confirmDialog?.type === 'delete' ? 'Delete' : 'Restore'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}