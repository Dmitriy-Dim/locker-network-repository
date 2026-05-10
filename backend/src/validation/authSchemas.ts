import { z } from "zod";

const passwordSchema = z.string()
    .min(12, 'Min 12 characters')
    .regex(/[A-Z]/, 'Must have uppercase')
    .regex(/[a-z]/, 'Must have lowercase')
    .regex(/[0-9]/, 'Must have number')
    .regex(/[^A-Za-z0-9]/, 'Must have special char');

const emailSchema = z.string().trim().toLowerCase().email();

export const signupSchema = z.object({
    body: z.object({
        name: z.string().trim().min(2),
        email: emailSchema,
        password: passwordSchema,
        phone: z.string()
            .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number')
            .optional(),
    }),
});

export const loginSchema = z.object({
    body: z.object({
        email: emailSchema,
        password: z.string().min(1),
    }),
});

export const googleLoginSchema = z.object({
    body: z.object({
        idToken: z.string().min(1, "Google idToken is required"),
    }),
});

export const refreshSchema = z.object({
    cookies: z.object({
        refreshToken: z.string().min(1, 'Refresh token is required'),
    }),
});

export const updatePasswordSchema = z.object({
    body: z.object({
        passwordCurrent: z.string().min(1),
        newPassword: passwordSchema,
    }),
});
