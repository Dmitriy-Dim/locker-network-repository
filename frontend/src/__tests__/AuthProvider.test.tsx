import { render, act, waitFor } from '@testing-library/react';


jest.mock('../api/authApi', () => ({
    loginApi: jest.fn(),
    registerApi: jest.fn(),
    googleLoginApi: jest.fn(),
    meApi: jest.fn(),
    logoutApi: jest.fn(),
}));

import { loginApi, meApi, logoutApi, googleLoginApi } from './../api/authApi.js';
import {useAuth} from "../hooks/useAuth.js";
import {AuthProvider} from "../providers/AuthProvider.js";
const mockLoginApi = loginApi as jest.Mock;
const mockMeApi = meApi as jest.Mock;
const mockLogoutApi = logoutApi as jest.Mock;
const mockGoogleLoginApi = googleLoginApi as jest.Mock;

const USER_MOCK = {
    userId: 'user_001',
    email: 'test@example.com',
    name: 'Test User',
    role: 'USER' as const,
    phone: null,
    createdAt: '2026-01-01T00:00:00.000Z',
};

function AuthConsumer({ onData }: { onData: (v: any) => void }) {
    const auth = useAuth();
    onData(auth);
    return <div data-testid="consumer">{auth.user?.email ?? 'no user'}</div>;
}

function renderWithAuth() {
    const capturedRef = { current: null as any };
    const utils = render(
        <AuthProvider>
            <AuthConsumer onData={(v) => { capturedRef.current = v; }} />
        </AuthProvider>
    );
    return { ...utils, capturedRef };
}

describe('AuthProvider — initial state', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
    });

    it('shows no user when no token in localStorage', async () => {
        mockMeApi.mockResolvedValue(null);

        const { findByTestId } = renderWithAuth();
        const el = await findByTestId('consumer');

        expect(el.textContent).toBe('no user');
    });

    it('restores user when valid token exists in localStorage', async () => {
        localStorage.setItem('access_token', 'valid-token');
        mockMeApi.mockResolvedValue(USER_MOCK);

        const { findByTestId } = renderWithAuth();
        const el = await findByTestId('consumer');

        await waitFor(() => expect(el.textContent).toBe(USER_MOCK.email));
    });

    it('clears token if meApi throws on init', async () => {
        localStorage.setItem('access_token', 'expired-token');
        mockMeApi.mockRejectedValueOnce(new Error('Unauthorized'));

        renderWithAuth();

        await waitFor(() =>
            expect(localStorage.getItem('access_token')).toBeNull()
        );
    });
});

describe('AuthProvider — login', () => {
    let hasLoggedIn = false;

    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
        hasLoggedIn = false;

        mockMeApi.mockImplementation(() => {
            return Promise.resolve(hasLoggedIn ? USER_MOCK : null);
        });
    });

    it('sets user after successful login', async () => {
        mockLoginApi.mockResolvedValueOnce({ accessToken: 'new-token' });

        const { capturedRef } = renderWithAuth();

        await waitFor(() => expect(capturedRef.current.loading).toBe(false));
        await act(async () => {
            hasLoggedIn = true;
            await capturedRef.current.login('test@example.com', 'password123');
        });

        expect(capturedRef.current.user).toMatchObject({ email: USER_MOCK.email });
        expect(localStorage.getItem('access_token')).toBe('new-token');
    });

    it('throws and does not set user on failed login', async () => {
        mockLoginApi.mockRejectedValueOnce(new Error('Invalid credentials'));

        const { capturedRef } = renderWithAuth();
        await waitFor(() => expect(capturedRef.current.loading).toBe(false));

        await expect(
            act(async () => {
                await capturedRef.current.login('bad@example.com', 'wrong');
            })
        ).rejects.toThrow('Invalid credentials');

        expect(capturedRef.current.user).toBeNull();
    });
});

describe('AuthProvider — logout', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
    });

    it('clears user and token on logout', async () => {
        localStorage.setItem('access_token', 'some-token');
        mockMeApi.mockResolvedValue(USER_MOCK);
        mockLogoutApi.mockResolvedValue(undefined);

        const { capturedRef } = renderWithAuth();
        await waitFor(() => expect(capturedRef.current.user).not.toBeNull());

        await act(async () => {
            await capturedRef.current.logout();
        });

        expect(capturedRef.current.user).toBeNull();
        expect(localStorage.getItem('access_token')).toBeNull();
    });

    it('still clears state even if logoutApi throws', async () => {
        localStorage.setItem('access_token', 'some-token');
        mockMeApi.mockResolvedValue(USER_MOCK);
        mockLogoutApi.mockRejectedValueOnce(new Error('Network error'));

        const { capturedRef } = renderWithAuth();
        await waitFor(() => expect(capturedRef.current.user).not.toBeNull());

        await act(async () => {
            await capturedRef.current.logout();
        });

        expect(capturedRef.current.user).toBeNull();
        expect(localStorage.getItem('access_token')).toBeNull();
    });
});

describe('AuthProvider — googleLogin', () => {
    let hasLoggedIn = false;

    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
        hasLoggedIn = false;

        mockMeApi.mockImplementation(() => {
            return Promise.resolve(hasLoggedIn ? USER_MOCK : null);
        });
    });

    it('sets user after successful google login', async () => {
        mockGoogleLoginApi.mockResolvedValueOnce({ accessToken: 'google-token' });

        const { capturedRef } = renderWithAuth();
        await waitFor(() => expect(capturedRef.current.loading).toBe(false));

        await act(async () => {
            hasLoggedIn = true;
            await capturedRef.current.googleLogin('google-id-token-xyz');
        });

        expect(capturedRef.current.user?.email).toBe(USER_MOCK.email);
        expect(localStorage.getItem('access_token')).toBe('google-token');
    });
});