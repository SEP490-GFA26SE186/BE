import authService from './auth.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

const register = catchAsync(async (req, res) => {
  const user = await authService.register(req.body);

  return ApiResponse.created(res, {
    message: 'User registered successfully',
    data: { user },
  });
});

export default {
  register,
};
