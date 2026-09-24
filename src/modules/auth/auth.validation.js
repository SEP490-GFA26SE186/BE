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

// ---- Kid PIN & Kid Mode ----

const setKidPin = z.object({
  body: z.object({
    pin: z
      .string({ required_error: 'PIN is required' })
      .regex(/^\d{4,6}$/, 'PIN must be between 4 and 6 numeric digits'),
  }),
});

const changeKidPin = z.object({
  body: z
    .object({
      currentPin: z.string().regex(/^\d{4,6}$/, 'Current PIN must be 4 to 6 digits').optional(),
      password: z.string().min(1, 'Password is required').optional(),
      newPin: z
        .string({ required_error: 'New PIN is required' })
        .regex(/^\d{4,6}$/, 'New PIN must be between 4 and 6 numeric digits'),
    })
    .refine((data) => data.currentPin || data.password, {
      message: 'Either current PIN or account password is required to change PIN',
      path: ['currentPin'],
    }),
});

const enterKidMode = z.object({
  body: z.object({
    childId: z
      .string({ required_error: 'childId is required' })
      .uuid('Invalid child ID format'),
  }),
});

const exitKidMode = z.object({
  body: z.object({
    pin: z
      .string({ required_error: 'PIN is required' })
      .regex(/^\d{4,6}$/, 'PIN must be 4 to 6 numeric digits'),
    kidSessionToken: z.string().optional(),
  }),
});

// ---- Email Verification ----

const sendVerificationEmail = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').optional(),
  }),
});

const verifyEmail = z.object({
  query: z.object({
    token: z.string().optional(),
  }),
  body: z.object({
    token: z.string().optional(),
  }),
}).refine((data) => data.query?.token || data.body?.token, {
  message: 'Verification token is required in query (?token=...) or request body',
  path: ['token'],
});

export default {
  register,
  login,
  refreshTokens,
  logout,
  setKidPin,
  changeKidPin,
  enterKidMode,
  exitKidMode,
  sendVerificationEmail,
  verifyEmail,
};
