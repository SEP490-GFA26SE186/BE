import authService from './auth.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

const register = catchAsync(async (req, res) => {
  const result = await authService.register(req.body);

  return ApiResponse.created(res, {
    message: 'User registered successfully',
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

export default {
  register,
  login,
  refreshTokens,
  logout,
  getMe,
};
