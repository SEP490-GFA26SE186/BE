import authService from './auth.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

const register = catchAsync(async (req, res) => {
  const result = await authService.register(req.body);

  return ApiResponse.created(res, {
    message: 'User registered successfully. A verification email has been sent.',
    data: result,
  });
});

const login = catchAsync(async (req, res) => {
  const result = await authService.login(req.body);

  return ApiResponse.success(res, {
    message: 'Login successful',
    data: result,
  });
});

const refreshTokens = catchAsync(async (req, res) => {
  const result = await authService.refreshTokens(req.body.refreshToken);

  return ApiResponse.success(res, {
    message: 'Tokens refreshed successfully',
    data: result,
  });
});

const logout = catchAsync(async (req, res) => {
  await authService.logout(req.body.refreshToken);

  return ApiResponse.success(res, {
    message: 'Logged out successfully',
  });
});

const getMe = catchAsync(async (req, res) => {
  const user = await authService.getUserProfile(req.user.id);

  return ApiResponse.success(res, {
    data: { user },
  });
});

// =============================================================================
// KID PIN & KID MODE
// =============================================================================

const setKidPin = catchAsync(async (req, res) => {
  const result = await authService.setKidPin(req.user.id, req.body.pin);

  return ApiResponse.success(res, {
    message: result.message,
  });
});

const changeKidPin = catchAsync(async (req, res) => {
  const result = await authService.changeKidPin(req.user.id, req.body);

  return ApiResponse.success(res, {
    message: result.message,
  });
});

const enterKidMode = catchAsync(async (req, res) => {
  const result = await authService.enterKidMode(req.user.id, req.body.childId);

  return ApiResponse.success(res, {
    message: 'Entered Kid Mode successfully',
    data: result,
  });
});

const exitKidMode = catchAsync(async (req, res) => {
  // Extract kidSessionToken from Authorization header or request body
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const kidSessionToken = req.body.kidSessionToken || tokenFromHeader;

  const result = await authService.exitKidMode({
    pin: req.body.pin,
    kidSessionToken,
    userId: req.user?.id,
  });

  return ApiResponse.success(res, {
    message: result.message,
    data: { tokens: result.tokens },
  });
});

// =============================================================================
// EMAIL VERIFICATION
// =============================================================================

const sendVerificationEmail = catchAsync(async (req, res) => {
  const result = await authService.sendVerificationEmail({
    userId: req.user?.id,
    email: req.body.email,
  });

  return ApiResponse.success(res, {
    message: result.message,
  });
});

const verifyEmail = catchAsync(async (req, res) => {
  const token = req.query.token || req.body.token;
  const result = await authService.verifyEmail(token);

  return ApiResponse.success(res, {
    message: result.message,
    data: result.user,
  });
});

export default {
  register,
  login,
  refreshTokens,
  logout,
  getMe,
  setKidPin,
  changeKidPin,
  enterKidMode,
  exitKidMode,
  sendVerificationEmail,
  verifyEmail,
};
