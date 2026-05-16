import { useEffect, useState } from 'react';
import {
    Alert, Box, Typography, Button, Dialog, DialogTitle, DialogContent,
    DialogActions, Chip, Stack, ToggleButton, ToggleButtonGroup
} from '@mui/material';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RestoreIcon from '@mui/icons-material/Restore';

import { getUsers, updateRole } from '../../../api/adminApi.ts';
import { adminUsersApi } from '../../../api/adminUsersApi.ts';
import type { User } from '../../../types/user/user.ts';
import { DataGrid, type GridColDef, type GridRenderCellParams } from '@mui/x-data-grid';
import { type Role, ROLES } from '../../../config/roles/roles.ts';

const AdminUsersTables = () => {
    const [error, setError] = useState<string | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DELETED'>('ALL');

    // modal
    const [manageDialogOpen, setManageDialogOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const loadUsers = () => {
        setLoading(true);
        getUsers()
            .then((resp) => setUsers(resp))
            .catch((err) => setError(err instanceof Error ? err.message : 'Unknown error'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const filteredUsers = users.filter((u) => {
        if (statusFilter === 'ACTIVE') return !u.isDeleted;
        if (statusFilter === 'DELETED') return u.isDeleted;
        return true;
    });

    const deletedCount = users.filter((u) => u.isDeleted).length;

    const handleOpenManage = (user: User) => {
        setSelectedUser(user);
        setActionError(null);
        setManageDialogOpen(true);
    };

    const handleDelete = async () => {
        if (!selectedUser) return;
        setActionLoading(true);
        setActionError(null);
        try {
            await adminUsersApi.deleteUser(selectedUser.userId);
            setManageDialogOpen(false);
            loadUsers();
        } catch (e: any) {
            setActionError(e?.response?.data?.error?.message ?? e?.message ?? 'Delete failed');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRestore = async () => {
        if (!selectedUser) return;
        setActionLoading(true);
        setActionError(null);
        try {
            await adminUsersApi.restoreUser(selectedUser.userId);
            setManageDialogOpen(false);
            loadUsers();
        } catch (e: any) {
            setActionError(e?.response?.data?.error?.message ?? e?.message ?? 'Restore failed');
        } finally {
            setActionLoading(false);
        }
    };

    const columns: GridColDef[] = [
        { field: 'userId', headerName: 'ID', width: 90 },
        { field: 'email', headerName: 'Email', flex: 1 },
        { field: 'phone', headerName: 'Phone', width: 130 },
        {
            field: 'role',
            headerName: 'Role',
            width: 150,
            editable: true,
            type: 'singleSelect',
            valueOptions: Object.values(ROLES),
        },
        {
            field: 'isDeleted',
            headerName: 'Status',
            width: 100,
            renderCell: (params: GridRenderCellParams) => (
                <Chip
                    label={params.value ? 'Deleted' : 'Active'}
                    size="small"
                    color={params.value ? 'default' : 'success'}
                    sx={{ fontWeight: 600 }}
                />
            ),
        },
        {
            field: 'actions',
            headerName: 'Manage',
            width: 120,
            sortable: false,
            filterable: false,
            renderCell: (params: GridRenderCellParams) => (
                <Button
                    size="small"
                    startIcon={<ManageAccountsIcon />}
                    onClick={() => handleOpenManage(params.row as User)}
                    sx={{ fontWeight: 700, fontSize: 11 }}
                >
                    Manage
                </Button>
            ),
        },
    ];

    return (
        <>
            <Box sx={{ maxWidth: '1100px', mx: 'auto', mt: 4 }}>
                <Typography variant="h4" fontWeight={900} textAlign="center" mb={3}>
                    Users
                </Typography>

                {/* status filter */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                    <ToggleButtonGroup
                        value={statusFilter}
                        exclusive
                        onChange={(_, v) => v && setStatusFilter(v)}
                        size="small"
                    >
                        <ToggleButton value="ALL" sx={{ fontWeight: 700, fontSize: 12 }}>
                            All ({users.length})
                        </ToggleButton>
                        <ToggleButton value="ACTIVE" sx={{ fontWeight: 700, fontSize: 12, '&.Mui-selected': { bgcolor: '#dcfce7', color: '#276749' } }}>
                            Active ({users.length - deletedCount})
                        </ToggleButton>
                        <ToggleButton value="DELETED" sx={{ fontWeight: 700, fontSize: 12, '&.Mui-selected': { bgcolor: '#fed7d7', color: '#c53030' } }}>
                            Deleted ({deletedCount})
                        </ToggleButton>
                    </ToggleButtonGroup>

                    <Typography variant="caption" color="text.secondary">
                        Showing {filteredUsers.length} users
                    </Typography>
                </Stack>

                <DataGrid
                    rows={filteredUsers}
                    columns={columns}
                    loading={loading}
                    editMode="row"
                    getRowId={(row) => row.userId}
                    pageSizeOptions={[5, 10, 20]}
                    disableRowSelectionOnClick
                    getRowClassName={(params) => (params.row.isDeleted ? 'row-deleted' : '')}
                    sx={{
                        '& .row-deleted': { opacity: 0.5, bgcolor: '#f8fafc' },
                        borderRadius: 2,
                    }}
                    processRowUpdate={async (newRow, oldRow) => {
                        try {
                            if (Object.values(ROLES).includes(newRow.role.trim().toUpperCase() as Role)) {
                                newRow.role = newRow.role.trim().toUpperCase() as Role;
                                await updateRole(newRow);
                                setError(null);
                                setUsers((prev) =>
                                    prev.map((u) =>
                                        u.userId === newRow.userId ? { ...u, role: newRow.role } : u
                                    )
                                );
                                return newRow;
                            }
                            throw new Error('Invalid role. Allowed roles: ' + Object.values(ROLES));
                        } catch (err) {
                            setError(err instanceof Error ? err.message : 'Update failed');
                            return oldRow;
                        }
                    }}
                    onProcessRowUpdateError={(err) => {
                        setError(err instanceof Error ? err.message : 'Update error');
                    }}
                />
            </Box>

            {error && (
                <Box sx={{ maxWidth: '1100px', mx: 'auto', mt: 2 }}>
                    <Alert severity="error">{error}</Alert>
                </Box>
            )}

            {/* manage dialog */}
            <Dialog
                open={manageDialogOpen}
                onClose={() => setManageDialogOpen(false)}
                maxWidth="xs"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ fontWeight: 800 }}>User Management</DialogTitle>
                <DialogContent>
                    {actionError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{actionError}</Alert>}

                    {selectedUser && (
                        <Stack spacing={1.5}>
                            <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                <Typography variant="body2" fontWeight={700}>{selectedUser.name ?? '—'}</Typography>
                                <Typography variant="body2" color="text.secondary">{selectedUser.email}</Typography>
                                {selectedUser.phone && (
                                    <Typography variant="caption" color="text.secondary">{selectedUser.phone}</Typography>
                                )}
                                <Stack direction="row" spacing={1} mt={1}>
                                    <Chip label={selectedUser.role} size="small" color="primary" sx={{ fontWeight: 700 }} />
                                    <Chip
                                        label={selectedUser.isDeleted ? 'Deleted' : 'Active'}
                                        size="small"
                                        color={selectedUser.isDeleted ? 'default' : 'success'}
                                        sx={{ fontWeight: 600 }}
                                    />
                                </Stack>
                            </Box>

                            <Typography variant="body2" color="text.secondary">
                                {selectedUser.isDeleted
                                    ? 'This user is deleted. You can restore access.'
                                    : 'You can soft-delete this user. They will lose access but can be restored later.'}
                            </Typography>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 3, gap: 1 }}>
                    <Button onClick={() => setManageDialogOpen(false)} sx={{ color: '#64748b', fontWeight: 700 }}>
                        Cancel
                    </Button>
                    {selectedUser?.isDeleted ? (
                        <Button
                            variant="contained"
                            startIcon={<RestoreIcon />}
                            onClick={handleRestore}
                            disabled={actionLoading}
                            sx={{ bgcolor: '#6baf5c', fontWeight: 700, borderRadius: 2, '&:hover': { bgcolor: '#5a9a4d' } }}
                        >
                            Restore User
                        </Button>
                    ) : (
                        <Button
                            variant="contained"
                            startIcon={<DeleteOutlineIcon />}
                            onClick={handleDelete}
                            disabled={actionLoading}
                            sx={{ bgcolor: '#e53e3e', fontWeight: 700, borderRadius: 2, '&:hover': { bgcolor: '#c53030' } }}
                        >
                            Delete User
                        </Button>
                    )}
                </DialogActions>
            </Dialog>
        </>
    );
};

export default AdminUsersTables;