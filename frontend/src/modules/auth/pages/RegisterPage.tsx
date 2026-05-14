import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
    Box, Paper, Typography, TextField, Button, Alert, Link, Divider,
    InputAdornment, IconButton
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

import { useAuth } from '../../../hooks/useAuth';
import { Paths } from "../../../config/paths/paths.ts";
import GoogleLoginTest from "./GoogleLoginTest.tsx";

export function RegisterPage() {
    const navigate = useNavigate();
    const { register } = useAuth();
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [validationError, setValidationError] = useState('');
    const [loading, setLoading] = useState(false);

    function validate() {
        if (name.trim().length < 2) return "Name must be at least 2 characters";
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return "Invalid email format";
        if (phone.trim().length < 10) return "Valid phone number is required";
        if (password.length < 6) return "Password must be at least 6 characters";
        return "";
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setValidationError('');

        const validation = validate();
        if (validation) {
            setValidationError(validation);
            return;
        }

        setLoading(true);

        try {
            await register(email, password, name, phone);
            navigate('/login');
        } catch (e: any) {
            setError(e?.response?.data?.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Box sx={{position: 'relative',  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f8fafc', p: 2 }}>

            <Paper elevation={0} sx={{ p: { xs: 4, md: 5 }, width: '100%', maxWidth: 450, borderRadius: 4, border: '1px solid #e2e8f0' }}>
                <Button
                    onClick={() => navigate('/')}
                    sx={{
                        position: 'absolute',
                        top: 20,
                        left: 20,
                        textTransform: 'none',
                        color: '#64748b',
                        fontWeight: 600,
                        fontSize: '16px',
                        padding: 0,
                        minWidth: 'auto',
                        '&:hover': {
                            color: '#4CAF50',
                            background: 'transparent'
                        }
                    }}
                    disableRipple
                >
                    ← Back to Home
                </Button>
                <Box display="flex" justifyContent="center" mb={3}>
                    <img
                        src="/logo_app.png"
                        alt="logo"
                        width={460}
                        height={240}
                    />
                </Box>
                <Typography variant="h4" fontWeight={800} textAlign="center" mb={4} color="#1e293b">
                    Create Account
                </Typography>

                <form onSubmit={handleSubmit}>
                    <Box display="flex" flexDirection="column" gap={2.5}>
                        <TextField
                            label="Enter your name *"
                            value={name}
                            autoComplete={'enter your name'}
                            onChange={e => setName(e.target.value)}
                            disabled={loading}
                            required
                            fullWidth
                        />
                        <TextField
                            label="Email address *"
                            type="email"
                            autoComplete={'enter your email'}
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            disabled={loading}
                            required
                            fullWidth
                        />
                        <TextField
                            label="Phone number *"
                            type="tel" placeholder={'+972'}
                            value={phone}
                            autoComplete={'enter your phone number'}
                            onChange={e => setPhone(e.target.value)}
                            disabled={loading}
                            required
                            fullWidth
                        />
                        <TextField
                            label="Password *"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            autoComplete={'enter your password'}
                            onChange={e => setPassword(e.target.value)}
                            disabled={loading}
                            required
                            fullWidth
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            onClick={() => setShowPassword(!showPassword)}
                                            edge="end"
                                        >
                                            {showPassword ? <VisibilityOff /> : <Visibility />}
                                        </IconButton>
                                    </InputAdornment>
                                )
                            }}
                        />

                        {validationError && <Alert severity="warning">{validationError}</Alert>}
                        {error && <Alert severity="error">{error}</Alert>}

                        <Button
                            type="submit"
                            variant="contained"
                            disabled={loading}
                            size="large"
                            sx={{ mt: 1, bgcolor: '#6baf5c', fontWeight: 'bold', '&:hover': { bgcolor: '#5a994c' } }}
                        >
                            {loading ? 'Creating...' : 'SIGN UP'}
                        </Button>
                    </Box>
                </form>

                <Divider sx={{ my: 3 }}>
                    <Typography variant="body2" color="text.secondary">OR</Typography>
                </Divider>

                <Box display="flex" justifyContent="center" mb={3}>
                    <GoogleLoginTest />
                </Box>

                <Typography textAlign="center" variant="body2" color="text.secondary">
                    Already have an account?{' '}
                    <Link component={RouterLink} to={Paths.LOGIN} sx={{ color: '#6baf5c', fontWeight: 'bold', textDecoration: 'none' }}>
                        Login
                    </Link>
                </Typography>
            </Paper>
        </Box>
    );
}