import { useState, useCallback, useRef } from 'react';
import {
    Box, Typography, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, TextField, Button,
    Stack, Chip, Alert, MenuItem, IconButton, Tooltip, Collapse,
    CircularProgress, InputAdornment
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import HistoryIcon from '@mui/icons-material/History';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import { useAuditLogs } from '../../../hooks/useAuditLogs';
import { adminUsersApi, type AdminUser } from '../../../api/adminUsersApi';
import type { AuditLogFilters, AuditLogEntry } from '../../../api/auditLogsApi';

const ENTITY_TYPES = ['', 'Booking', 'LockerBox', 'Station', 'City', 'User', 'Price', 'Operation', 'AuditLog'];
const PAGE_SIZE = 50;

const actionColor = (action: string): 'success' | 'error' | 'warning' | 'info' | 'default' => {
    if (action.includes('CREATE') || action.includes('SUCCESS') || action.includes('LOGIN') || action.includes('RESTORE')) return 'success';
    if (action.includes('DELETE') || action.includes('FAILED') || action.includes('LOGOUT') || action.includes('EXPIRE')) return 'error';
    if (action.includes('UPDATE') || action.includes('CHANGE') || action.includes('STATUS')) return 'warning';
    return 'info';
};

function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
}

function formatDetails(details: Record<string, any>): string[] {
    const lines: string[] = [];
    if (details.old && details.new) {
        const allKeys = new Set([...Object.keys(details.old), ...Object.keys(details.new)]);
        allKeys.forEach((key) => {
            const oldVal = details.old[key];
            const newVal = details.new[key];
            if (oldVal !== newVal) lines.push(`${cap(key)}: ${oldVal ?? '—'} → ${newVal ?? '—'}`);
        });
        return lines.length > 0 ? lines : ['No changes detected'];
    }
    if (details.previousStatus && details.nextStatus) return [`Status: ${details.previousStatus} → ${details.nextStatus}`];
    if (details.filters) {
        Object.entries(details.filters).forEach(([k, v]) => { if (v) lines.push(`${cap(k)}: ${v}`); });
        return lines.length > 0 ? lines : ['Query with filters'];
    }
    if (details.ipAddress) lines.push(`IP: ${details.ipAddress}`);
    if (details.userAgent) lines.push(`UA: ${String(details.userAgent).slice(0, 50)}…`);
    if (details.reason) lines.push(`Reason: ${details.reason}`);
    if (lines.length === 0) {
        Object.entries(details).forEach(([k, v]) => {
            if (v != null) lines.push(`${cap(k)}: ${typeof v === 'object' ? JSON.stringify(v) : String(v).slice(0, 60)}`);
        });
    }
    return lines.length > 0 ? lines : ['—'];
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1).replace(/([A-Z])/g, ' $1'); }

function IdCell({ id, onClick }: { id: string; onClick?: () => void }) {
    if (!id) return <Typography variant="caption" color="text.disabled">—</Typography>;
    return (
        <Tooltip title={`${id}\nClick to filter · Double-click to copy`}>
            <Box
                onClick={onClick}
                onDoubleClick={() => copyToClipboard(id)}
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3, cursor: 'pointer', '&:hover': { bgcolor: '#e2e8f0' }, borderRadius: 1, px: 0.3, transition: '0.1s' }}
            >
                <Typography variant="caption" fontFamily="monospace" fontSize={10} sx={{ bgcolor: '#f1f5f9', px: 0.6, py: 0.2, borderRadius: 0.5 }}>
                    {id.slice(0, 8)}…
                </Typography>
                <ContentCopyIcon sx={{ fontSize: 9, color: '#cbd5e1' }} />
            </Box>
        </Tooltip>
    );
}

function ActorInfo({ actorId, cache, loadActor }: { actorId: string | null; cache: React.MutableRefObject<Record<string, AdminUser | 'loading' | 'error'>>; loadActor: (id: string) => void }) {
    if (!actorId) return null;
    const entry = cache.current[actorId];
    if (!entry) { loadActor(actorId); return null; }
    if (entry === 'loading') return <CircularProgress size={10} />;
    if (entry === 'error') return null;
    return (
        <Stack direction="row" spacing={0.3} alignItems="center" mt={0.3}>
            <PersonIcon sx={{ fontSize: 11, color: '#6baf5c' }} />
            <Typography variant="caption" fontSize={10} fontWeight={600} color="text.secondary">
                {entry.name ?? entry.email}
            </Typography>
            <Chip label={entry.role} size="small" sx={{ fontSize: 8, height: 14, fontWeight: 700 }} />
        </Stack>
    );
}

/** Resolves entity info for User entities — reuses the same actor cache */
function EntityInfo({ entityType, entityId, cache, loadActor }: {
    entityType: string; entityId: string;
    cache: React.MutableRefObject<Record<string, AdminUser | 'loading' | 'error'>>;
    loadActor: (id: string) => void;
}) {
    if (entityType !== 'User' || !entityId) return null;
    const entry = cache.current[entityId];
    if (!entry) { loadActor(entityId); return null; }
    if (entry === 'loading') return <CircularProgress size={10} />;
    if (entry === 'error') return null;
    return (
        <Stack direction="row" spacing={0.3} alignItems="center" mt={0.3}>
            <PersonIcon sx={{ fontSize: 11, color: '#e53e3e' }} />
            <Typography variant="caption" fontSize={10} fontWeight={600} color="text.secondary">
                {entry.name ?? '—'} ({entry.email})
            </Typography>
        </Stack>
    );
}

/** Builds a human-readable one-line summary of what happened */
function buildActionSummary(log: AuditLogEntry, cache: Record<string, AdminUser | 'loading' | 'error'>): string | null {
    const actorName = (() => {
        if (!log.actorId) return null; // FIX: guard against null actorId
        const a = cache[log.actorId];
        return a && typeof a === 'object' ? (a.name ?? a.email) : null;
    })();
    const entityName = (() => {
        if (log.entityType !== 'User') return null;
        const e = cache[log.entityId];
        return e && typeof e === 'object' ? (e.name ?? e.email) : null;
    })();

    const actor = actorName ?? (log.actorId ? `Actor ${log.actorId.slice(0, 8)}…` : 'System');
    const entity = entityName ? `"${entityName}"` : `${log.entityType} ${log.entityId.slice(0, 8)}…`;

    switch (true) {
        case log.action.includes('DELETE'): return `${actor} deleted ${entity}`;
        case log.action.includes('RESTORE'): return `${actor} restored ${entity}`;
        case log.action.includes('ROLE_UPDATE'): {
            const oldRole = log.details?.old?.role;
            const newRole = log.details?.new?.role;
            return oldRole && newRole
                ? `${actor} changed ${entity} role: ${oldRole} → ${newRole}`
                : `${actor} updated role of ${entity}`;
        }
        case log.action.includes('CREATE'): return `${actor} created ${entity}`;
        case log.action.includes('UPDATE'): return `${actor} updated ${entity}`;
        case log.action.includes('LOGIN'): return `${actor} logged in`;
        case log.action.includes('LOGOUT'): return `${actor} logged out`;
        case log.action.includes('EXPIRE'): return `${entity} expired`;
        case log.action.includes('TOKEN_REFRESH'): return `${actor} refreshed token`;
        case log.action.includes('AUDIT_LOG_READ'): return `${actor} read audit logs`;
        default: return `${actor} performed ${log.action} on ${entity}`;
    }
}

function ExpandableRow({ log, onFilterActor, onFilterEntity, actorCache, loadActor }: {
    log: AuditLogEntry; onFilterActor: (id: string) => void; onFilterEntity: (t: string, id: string) => void;
    actorCache: React.MutableRefObject<Record<string, AdminUser | 'loading' | 'error'>>; loadActor: (id: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const hasDetails = log.details && Object.keys(log.details).length > 0;
    const detailLines = hasDetails ? formatDetails(log.details!) : [];
    const summary = buildActionSummary(log, actorCache.current);

    return (
        <>
            <TableRow sx={{ '&:hover': { bgcolor: '#f8fafc' }, '& > *': { borderBottom: open ? 'none' : undefined, py: 1 } }}>
                <TableCell sx={{ width: 28, p: 0.3 }}>
                    {hasDetails && (
                        <IconButton size="small" onClick={() => setOpen(!open)} sx={{ p: 0.3 }}>
                            {open ? <KeyboardArrowUpIcon sx={{ fontSize: 16 }} /> : <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />}
                        </IconButton>
                    )}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Typography variant="caption" fontSize={11}>{new Date(log.createdAt).toLocaleDateString('en-GB')}</Typography>
                    <Typography variant="caption" display="block" color="text.disabled" fontSize={10}>{new Date(log.createdAt).toLocaleTimeString('en-GB')}</Typography>
                </TableCell>
                <TableCell>
                    <Chip label={log.action} size="small" color={actionColor(log.action)} sx={{ fontWeight: 700, fontSize: 9, height: 22 }} />
                    {summary && (
                        <Typography variant="caption" display="block" fontSize={10} color="text.secondary" mt={0.3} sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {summary}
                        </Typography>
                    )}
                </TableCell>
                <TableCell>
                    <Typography variant="caption" fontWeight={600} fontSize={11}>{log.entityType}</Typography>
                    <Box><IdCell id={log.entityId} onClick={() => onFilterEntity(log.entityType, log.entityId)} /></Box>
                    <EntityInfo entityType={log.entityType} entityId={log.entityId} cache={actorCache} loadActor={loadActor} />
                </TableCell>
                <TableCell>
                    {log.actorId ? (
                        <>
                            <IdCell id={log.actorId} onClick={() => onFilterActor(log.actorId!)} />
                            <ActorInfo actorId={log.actorId} cache={actorCache} loadActor={loadActor} />
                        </>
                    ) : (
                        <Typography variant="caption" color="text.disabled" fontSize={10}>System</Typography>
                    )}
                </TableCell>
                <TableCell>
                    {hasDetails ? (
                        <Typography variant="caption" fontSize={10} color="text.secondary" sx={{ display: 'block', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {detailLines[0]}{detailLines.length > 1 ? ` (+${detailLines.length - 1})` : ''}
                        </Typography>
                    ) : <Typography variant="caption" color="text.disabled">—</Typography>}
                </TableCell>
            </TableRow>

            {hasDetails && (
                <TableRow>
                    <TableCell colSpan={6} sx={{ py: 0 }}>
                        <Collapse in={open} timeout="auto" unmountOnExit>
                            <Box sx={{ py: 1.5, pl: 5, pr: 2 }}>
                                <Box sx={{ bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1.5, p: 1.5, mb: 1 }}>
                                    {detailLines.map((line, i) => (
                                        <Typography key={i} variant="caption" display="block" fontFamily="monospace" fontSize={11} lineHeight={1.8}>{line}</Typography>
                                    ))}
                                </Box>
                                <RawJsonToggle details={log.details!} />
                            </Box>
                        </Collapse>
                    </TableCell>
                </TableRow>
            )}
        </>
    );
}

function RawJsonToggle({ details }: { details: Record<string, any> }) {
    const [show, setShow] = useState(false);
    return (
        <Box>
            <Button size="small" onClick={() => setShow(!show)} sx={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', p: 0 }}>
                {show ? 'Hide raw JSON' : 'Show raw JSON'}
            </Button>
            <Collapse in={show}>
                <Box sx={{ mt: 0.5, bgcolor: '#1e293b', borderRadius: 1.5, p: 1.5, maxHeight: 200, overflow: 'auto' }}>
                    <pre style={{ margin: 0, fontSize: 10, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#e2e8f0' }}>
                        {JSON.stringify(details, null, 2)}
                    </pre>
                </Box>
            </Collapse>
        </Box>
    );
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function AdminAuditLogsPage() {
    const [filters, setFilters] = useState<AuditLogFilters>({ limit: PAGE_SIZE, skip: 0 });
    const [localSearch, setLocalSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    const actorCache = useRef<Record<string, AdminUser | 'loading' | 'error'>>({});
    const [, forceRender] = useState(0);

    const { logs, meta, isLoading, isError } = useAuditLogs(filters);

    const loadActor = useCallback((actorId: string) => {
        if (!actorId) return; // FIX: guard against null/empty actorId — prevents 404 on /admin/users/null
        if (actorCache.current[actorId]) return;
        actorCache.current[actorId] = 'loading';
        adminUsersApi.getById(actorId)
            .then((user) => { actorCache.current[actorId] = user; forceRender((n) => n + 1); })
            .catch(() => { actorCache.current[actorId] = 'error'; forceRender((n) => n + 1); });
    }, []);

    const updateFilter = (patch: Partial<AuditLogFilters>) => setFilters((f) => ({ ...f, ...patch, skip: 0 }));
    const handleFilterActor = (actorId: string) => updateFilter({ actorId });
    const handleFilterEntity = (entityType: string, entityId: string) => updateFilter({ entityType, entityId });
    const handleReset = () => { setFilters({ limit: PAGE_SIZE, skip: 0 }); setLocalSearch(''); };
    const handlePageNext = () => setFilters((f) => ({ ...f, skip: (f.skip ?? 0) + PAGE_SIZE }));
    const handlePagePrev = () => setFilters((f) => ({ ...f, skip: Math.max(0, (f.skip ?? 0) - PAGE_SIZE) }));

    const currentPage = Math.floor((filters.skip ?? 0) / PAGE_SIZE) + 1;
    const totalPages = Math.ceil(meta.total / PAGE_SIZE) || 1;

    const activeFilters = Object.entries(filters).filter(([k, v]) => v && k !== 'limit' && k !== 'skip');

    const displayLogs = localSearch
        ? logs.filter((log) => {
            const q = localSearch.toLowerCase();
            return [log.action, log.entityType, log.entityId, log.actorId ?? '', log.lockerId ?? '', log.createdAt, log.details ? JSON.stringify(log.details) : ''].join(' ').toLowerCase().includes(q);
        })
        : logs;

    return (
        <Box sx={{ mt: 4, px: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1.5} mb={3}>
                <HistoryIcon sx={{ fontSize: 32, color: '#6baf5c' }} />
                <Typography variant="h4" fontWeight={900}>Audit Logs</Typography>
            </Stack>

            {isError && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>Failed to load audit logs.</Alert>}

            {/* search + filter toggle */}
            <Paper elevation={0} sx={{ mb: 2, borderRadius: 2, border: '1px solid #e2e8f0' }}>
                <Stack direction="row" spacing={1.5} alignItems="center" p={1.5}>
                    <TextField
                        placeholder="Search all fields…"
                        value={localSearch}
                        onChange={(e) => setLocalSearch(e.target.value)}
                        size="small"
                        sx={{ flex: 1 }}
                        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#94a3b8', fontSize: 18 }} /></InputAdornment> }}
                    />
                    <Button
                        size="small"
                        startIcon={<FilterListIcon />}
                        onClick={() => setShowFilters(!showFilters)}
                        sx={{ fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}
                    >
                        Filters {activeFilters.length > 0 && `(${activeFilters.length})`}
                    </Button>
                    <Typography variant="caption" color="text.secondary" whiteSpace="nowrap">{meta.total} records</Typography>
                </Stack>

                {/* active filter chips — always visible */}
                {activeFilters.length > 0 && (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" px={1.5} pb={1}>
                        {activeFilters.map(([key, val]) => (
                            <Chip key={key} label={`${key}: ${String(val).slice(0, 16)}`} size="small" onDelete={() => updateFilter({ [key]: undefined })} sx={{ fontSize: 10, fontWeight: 600 }} />
                        ))}
                        <Chip label="Reset all" size="small" onClick={handleReset} sx={{ fontSize: 10, fontWeight: 700, color: '#e53e3e' }} />
                    </Stack>
                )}

                {/* collapsible server filters */}
                <Collapse in={showFilters}>
                    <Box sx={{ px: 1.5, pb: 2 }}>
                        <Stack spacing={1.5}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                <TextField label="From" type="datetime-local" size="small" value={filters.from ?? ''} onChange={(e) => updateFilter({ from: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
                                <TextField label="To" type="datetime-local" size="small" value={filters.to ?? ''} onChange={(e) => updateFilter({ to: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
                            </Stack>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                <TextField label="Actor ID" size="small" value={filters.actorId ?? ''} onChange={(e) => updateFilter({ actorId: e.target.value })} sx={{ flex: 1 }} />
                                <TextField select label="Entity Type" size="small" value={filters.entityType ?? ''} onChange={(e) => updateFilter({ entityType: e.target.value })} sx={{ flex: 1 }}>
                                    {ENTITY_TYPES.map((t) => <MenuItem key={t} value={t}>{t || 'All Types'}</MenuItem>)}
                                </TextField>
                                <TextField label="Entity ID" size="small" value={filters.entityId ?? ''} onChange={(e) => updateFilter({ entityId: e.target.value })} sx={{ flex: 1 }} />
                            </Stack>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                <TextField label="Action" size="small" value={filters.action ?? ''} onChange={(e) => updateFilter({ action: e.target.value })} placeholder="e.g. USER_ROLE_UPDATE" sx={{ flex: 1 }} />
                                <TextField label="Locker ID" size="small" value={filters.lockerId ?? ''} onChange={(e) => updateFilter({ lockerId: e.target.value })} sx={{ flex: 1 }} />
                            </Stack>
                        </Stack>
                    </Box>
                </Collapse>
            </Paper>

            {/* table — full width, no maxWidth constraint */}
            <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <TableContainer sx={{ overflowX: 'auto' }}>
                    <Table size="small" sx={{ minWidth: 900 }}>
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#f8fafc' }}>
                                <TableCell sx={{ width: 28 }} />
                                <TableCell sx={{ fontWeight: 700 }}>Time</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Action</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Entity</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Actor</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Details</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress size={28} sx={{ color: '#6baf5c' }} /></TableCell></TableRow>
                            ) : displayLogs.length === 0 ? (
                                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: '#94a3b8' }}>No audit logs found.</TableCell></TableRow>
                            ) : (
                                displayLogs.map((log) => (
                                    <ExpandableRow
                                        key={log.id}
                                        log={log}
                                        onFilterActor={handleFilterActor}
                                        onFilterEntity={handleFilterEntity}
                                        actorCache={actorCache}
                                        loadActor={loadActor}
                                    />
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                <Stack direction="row" justifyContent="space-between" alignItems="center" px={2} py={1} borderTop="1px solid #e2e8f0">
                    <Typography variant="caption" color="text.secondary">Page {currentPage} of {totalPages}</Typography>
                    <Stack direction="row" spacing={0.5}>
                        <IconButton size="small" onClick={handlePagePrev} disabled={(filters.skip ?? 0) === 0}><NavigateBeforeIcon fontSize="small" /></IconButton>
                        <IconButton size="small" onClick={handlePageNext} disabled={(filters.skip ?? 0) + PAGE_SIZE >= meta.total}><NavigateNextIcon fontSize="small" /></IconButton>
                    </Stack>
                </Stack>
            </Paper>
        </Box>
    );
}