import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ProtectedRoute } from '../modules/shared/components/ProtectedRoute';
import { RoleGuard } from '../modules/shared/components/RoleGuard';

jest.mock('../hooks/useAuth', () => ({
    useAuth: jest.fn(),
}));

const mockUseAuth = () => useAuth as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
});

// ─── ProtectedRoute ───────────────────────────────────────────────────────────

describe('ProtectedRoute', () => {
    it('renders children when user is authenticated', () => {
        mockUseAuth().mockReturnValue({ user: { userId: '1', role: 'USER' }, loading: false });

        render(
            <MemoryRouter>
                <ProtectedRoute>
                    <div>Protected Content</div>
                </ProtectedRoute>
            </MemoryRouter>
        );

        expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('redirects to /login when user is null', () => {
        mockUseAuth().mockReturnValue({ user: null, loading: false });

        render(
            <MemoryRouter initialEntries={['/dashboard']}>
                <Routes>
                    <Route path="/login" element={<div>Login Page</div>} />
                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute>
                                <div>Dashboard</div>
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('Login Page')).toBeInTheDocument();
        expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    });

    it('renders nothing (null) while loading', () => {
        mockUseAuth().mockReturnValue({ user: null, loading: true });

        const { container } = render(
            <MemoryRouter>
                <ProtectedRoute>
                    <div>Protected Content</div>
                </ProtectedRoute>
            </MemoryRouter>
        );

        expect(container.firstChild).toBeNull();
    });
});

// ─── RoleGuard ────────────────────────────────────────────────────────────────

describe('RoleGuard', () => {
    it('renders children when user role is allowed', () => {
        mockUseAuth().mockReturnValue({ user: { userId: '1', role: 'ADMIN' }, loading: false });

        render(
            <MemoryRouter>
                <RoleGuard allowed={['ADMIN']}>
                    <div>Admin Panel</div>
                </RoleGuard>
            </MemoryRouter>
        );

        expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    });

    it('redirects to /403 when user role is not allowed', () => {
        mockUseAuth().mockReturnValue({ user: { userId: '1', role: 'USER' }, loading: false });

        render(
            <MemoryRouter initialEntries={['/admin']}>
                <Routes>
                    <Route path="/403" element={<div>Forbidden</div>} />
                    <Route
                        path="/admin"
                        element={
                            <RoleGuard allowed={['ADMIN', 'OPERATOR']}>
                                <div>Admin Only</div>
                            </RoleGuard>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('Forbidden')).toBeInTheDocument();
        expect(screen.queryByText('Admin Only')).not.toBeInTheDocument();
    });

    it('redirects to /login when user is null', () => {
        mockUseAuth().mockReturnValue({ user: null, loading: false });

        render(
            <MemoryRouter initialEntries={['/admin']}>
                <Routes>
                    <Route path="/login" element={<div>Login Page</div>} />
                    <Route
                        path="/admin"
                        element={
                            <RoleGuard allowed={['ADMIN']}>
                                <div>Admin Only</div>
                            </RoleGuard>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('Login Page')).toBeInTheDocument();
    });

    it('allows multiple roles', () => {
        mockUseAuth().mockReturnValue({ user: { userId: '2', role: 'OPERATOR' }, loading: false });

        render(
            <MemoryRouter>
                <RoleGuard allowed={['ADMIN', 'OPERATOR']}>
                    <div>Operator Panel</div>
                </RoleGuard>
            </MemoryRouter>
        );

        expect(screen.getByText('Operator Panel')).toBeInTheDocument();
    });
});