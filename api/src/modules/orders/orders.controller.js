import * as ordersService from './orders.service.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

// =============================================================================
// CART CONTROLLERS
// =============================================================================

const getCart = catchAsync(async (req, res) => {
  const cart = await ordersService.getCart(req.user.id);
  return ApiResponse.success(res, {
    data: cart,
  });
});

const addToCart = catchAsync(async (req, res) => {
  const result = await ordersService.addToCart(req.user.id, req.body.listingId);
  return ApiResponse.created(res, {
    message: result.message,
    data: result.cartItem,
  });
});

const removeFromCart = catchAsync(async (req, res) => {
  const result = await ordersService.removeFromCart(req.user.id, req.params.listingId);
  return ApiResponse.success(res, {
    message: result.message,
  });
});

const clearCart = catchAsync(async (req, res) => {
  const result = await ordersService.clearCart(req.user.id);
  return ApiResponse.success(res, {
    message: result.message,
  });
});

// =============================================================================
// ORDER CONTROLLERS
// =============================================================================

const createOrder = catchAsync(async (req, res) => {
  const order = await ordersService.createOrder(req.user.id, req.body);
  return ApiResponse.created(res, {
    message: order.status === 'paid' ? 'Đơn hàng đã được hoàn tất và kích hoạt' : 'Tạo đơn hàng thành công, chờ thanh toán',
    data: { order },
  });
});

const getMyOrders = catchAsync(async (req, res) => {
  const result = await ordersService.getMyOrders(req.user.id, req.query);
  return ApiResponse.success(res, {
    data: result,
  });
});

const getOrderById = catchAsync(async (req, res) => {
  const order = await ordersService.getOrderById(req.user, req.params.id);
  return ApiResponse.success(res, {
    data: { order },
  });
});

const cancelOrder = catchAsync(async (req, res) => {
  const result = await ordersService.cancelOrder(req.user.id, req.params.id);
  return ApiResponse.success(res, {
    message: result.message,
    data: { order: result.order },
  });
});

// =============================================================================
// ENTITLEMENT CONTROLLERS
// =============================================================================

const getMyEntitlements = catchAsync(async (req, res) => {
  const entitlements = await ordersService.getMyEntitlements(req.user.id);
  return ApiResponse.success(res, {
    data: { entitlements },
  });
});

const personalizeEntitlement = catchAsync(async (req, res) => {
  const result = await ordersService.personalizeEntitlement(req.user.id, req.params.id, req.body);
  return ApiResponse.created(res, {
    message: result.message,
    data: result,
  });
});

export {
  // Cart
  getCart,
  addToCart,
  removeFromCart,
  clearCart,
  // Orders
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  // Entitlements
  getMyEntitlements,
  personalizeEntitlement,
};
