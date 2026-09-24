import { z } from 'zod';

const register = z.object({
  body: z.object({
    username: z
      .string({ required_error: 'Username is required' })
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(50, 'Username cannot exceed 50 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .email('Invalid email address')
      .max(255, 'Email cannot exceed 255 characters'),
    password: z
      .string({ required_error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters'),
    fullName: z
      .string()
      .trim()
      .max(150, 'Full name cannot exceed 150 characters')
      .optional(),
    phone: z
      .string()
      .trim()
      .max(20, 'Phone number cannot exceed 20 characters')
      .optional(),
  }),
});

const login = z.object({
  body: z
    .object({
      emailOrUsername: z.string().trim().optional(),
      email: z.string().trim().optional(),
      username: z.string().trim().optional(),
      password: z
        .string({ required_error: 'Password is required' })
        .min(1, 'Password is required'),
    })
    .refine((data) => data.emailOrUsername || data.email || data.username, {
      message: 'Email or username is required',
      path: ['emailOrUsername'],
    }),
});

const refreshTokens = z.object({
  body: z.object({
    refreshToken: z
      .string({ required_error: 'Refresh token is required' })
      .min(1, 'Refresh token is required'),
  }),
});

const logout = z.object({
  body: z.object({
    refreshToken: z
      .string({ required_error: 'Refresh token is required' })
      .min(1, 'Refresh token is required'),
  }),
});

export default {
  register,
  login,
  refreshTokens,
  logout,
};
