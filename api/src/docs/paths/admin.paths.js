// Quan tri (rev8): tai khoan, goi + bac gia, cau hinh, hoan tien, tai chinh, nhat ky. + lich su thanh toan cua phu huynh.
const bearer = [{ BearerAuth: [] }];
const path = (name) => ({ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
const query = (name, schema) => ({ name, in: 'query', schema });
const json = (schema) => ({ required: true, content: { 'application/json': { schema } } });
const obj = (properties, required) => ({ type: 'object', ...(required && { required }), properties });
const planProps = {
  name: { type: 'string' },
  priceVnd: { type: 'integer' },
  creditsPerMonth: { type: 'integer' },
  maxChildren: { type: 'integer' },
  maxCharacters: { type: 'integer' },
  canSell: { type: 'boolean' },
  isActive: { type: 'boolean' },
};

export default {
  '/plans': { get: { tags: ['Plans'], summary: 'Gói đang bán (công khai)', responses: { 200: { description: 'mảng gói' } } } },
  '/plans/{id}': { get: { tags: ['Plans'], summary: 'Chi tiết gói', parameters: [path('id')], responses: { 200: { description: 'gói' }, 404: { description: 'Không có' } } } },

  '/payments/orders': {
    get: { tags: ['Payments'], summary: '[Parent] Lịch sử thanh toán (đơn có phí) + trạng thái / hạn hoàn tiền từng mục', security: bearer, responses: { 200: { description: '{ refundWindowDays, orders: [{ id, totalVnd, paidAt, items: [{ id, itemType, title, unitPriceVnd, status, refund, refundable, deadline, reason }] }] }' } } },
  },
  '/payments/order-items/{itemId}/refund': {
    post: {
      tags: ['Payments'],
      summary: '[Parent] Yêu cầu hoàn tiền',
      description: 'Trong `market.refund_window_days` (mặc định 3) ngày kể từ lúc trả. Đã gửi → 409; quá hạn / 0đ → 422. Doanh thu người bán của mục này được giữ lại tới khi Admin quyết.',
      security: bearer,
      parameters: [path('itemId')],
      requestBody: json(obj({ reason: { type: 'string', minLength: 10 } }, ['reason'])),
      responses: { 201: { description: '{ refund }' } },
    },
  },

  '/admin/overview': { get: { tags: ['Admin'], summary: '[Admin] Badge menu: rút tiền / hoàn tiền / kháng nghị đang chờ', security: bearer, responses: { 200: { description: '{ navBadges }' } } } },
  '/admin/accounts': {
    get: {
      tags: ['Admin'],
      summary: '[Admin] Tài khoản',
      security: bearer,
      parameters: [
        query('role', { type: 'string', enum: ['all', 'parent', 'specialist', 'admin'] }),
        query('status', { type: 'string', enum: ['all', 'active', 'locked'] }),
        query('search', { type: 'string' }),
        query('page', { type: 'integer' }),
        query('limit', { type: 'integer' }),
      ],
      responses: { 200: { description: '{ accounts: [{ id, role, email, username, fullName, isActive, plan, creditBalance, childrenCount, seller }], pagination }' } },
    },
  },
  '/admin/accounts/{userId}': {
    patch: {
      tags: ['Admin'],
      summary: '[Admin] Khoá / mở khoá tài khoản',
      description: 'Khoá → mọi request bị 401, phiên đăng nhập bị thu hồi. Không tự khoá mình, không khoá Admin khác.',
      security: bearer,
      parameters: [path('userId')],
      requestBody: json(obj({ isActive: { type: 'boolean' } }, ['isActive'])),
      responses: { 200: { description: '{ id, isActive }' } },
    },
  },
  '/admin/accounts/moderators': {
    post: {
      tags: ['Admin'],
      summary: '[Admin] Tạo tài khoản Chuyên gia sư phạm',
      security: bearer,
      requestBody: json(obj({ email: { type: 'string' }, username: { type: 'string' }, fullName: { type: 'string' }, password: { type: 'string', minLength: 8 } }, ['email', 'username', 'fullName', 'password'])),
      responses: { 201: { description: '{ account }' }, 409: { description: 'Email / tên đăng nhập đã dùng' } },
    },
  },
  '/admin/plans': {
    get: { tags: ['Admin'], summary: '[Admin] Mọi gói (kể cả đã tắt) + số người đang dùng', security: bearer, responses: { 200: { description: '{ plans }' } } },
    post: {
      tags: ['Admin'],
      summary: '[Admin] Tạo gói',
      security: bearer,
      requestBody: json(obj({ code: { type: 'string', example: 'FAMILY_QUARTER' }, durationMonths: { type: 'integer', enum: [1, 12] }, ...planProps }, ['code', 'name', 'durationMonths', 'priceVnd', 'creditsPerMonth', 'maxChildren', 'maxCharacters'])),
      responses: { 201: { description: '{ plan }' }, 409: { description: 'Trùng mã' } },
    },
  },
  '/admin/plans/{planId}': {
    put: {
      tags: ['Admin'],
      summary: '[Admin] Sửa gói',
      description: 'Giá / credit mới áp dụng cho lần mua sau (đơn cũ đã chốt giá; kỳ đang chạy cấp theo gói hiện tại từ tháng kế tiếp). Gói FREE: giá luôn 0, không tắt được.',
      security: bearer,
      parameters: [path('planId')],
      requestBody: json(obj(planProps)),
      responses: { 200: { description: '{ plan }' }, 422: { description: 'Vi phạm ràng buộc gói Miễn phí' } },
    },
  },
  '/admin/settings': {
    get: { tags: ['Admin'], summary: '[Admin] Cấu hình được sửa (chi phí AI, chợ, giám sát)', security: bearer, responses: { 200: { description: '{ groups, settings: [{ key, group, label, unit, type, min, max, value, isDefault, updatedAt, updatedBy }] }' } } },
  },
  '/admin/settings/{key}': {
    put: {
      tags: ['Admin'],
      summary: '[Admin] Sửa một cấu hình',
      description: 'Chỉ khoá trong danh sách; kiểm khoảng + ràng buộc chéo (thời hạn hoàn tiền ≤ số ngày giữ doanh thu).',
      security: bearer,
      parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string', example: 'market.seller_share_rate' } }],
      requestBody: json(obj({ value: { type: 'number' } }, ['value'])),
      responses: { 200: { description: '{ setting }' }, 422: { description: 'Giá trị không hợp lệ' } },
    },
  },
  '/admin/refunds': {
    get: {
      tags: ['Admin'],
      summary: '[Admin] Yêu cầu hoàn tiền',
      description: 'Kèm STK người trả (từ webhook payOS, nếu có) và ảnh hưởng: gói → credit đã dùng trong kỳ; truyện → doanh thu người bán đang giữ hay đã mở.',
      security: bearer,
      parameters: [query('status', { type: 'string', enum: ['pending', 'approved', 'rejected', 'all'] })],
      responses: { 200: { description: '{ refunds }' } },
    },
  },
  '/admin/refunds/{refundId}/decision': {
    post: {
      tags: ['Admin'],
      summary: '[Admin] Duyệt / từ chối hoàn tiền',
      description: 'Duyệt (sau khi đã chuyển trả thủ công, bắt buộc mã giao dịch): truyện → thu hồi quyền đọc, gỡ khỏi giá sách bé, trừ doanh thu người bán; gói → huỷ, hết credit, về gói Miễn phí. Từ chối bắt buộc ghi chú.',
      security: bearer,
      parameters: [path('refundId')],
      requestBody: json(obj({ approve: { type: 'boolean' }, bankTransactionRef: { type: 'string' }, note: { type: 'string' } }, ['approve'])),
      responses: { 200: { description: '{ refundId, status }' }, 409: { description: 'Đã xử lý' } },
    },
  },
  '/admin/finance/summary': {
    get: {
      tags: ['Admin'],
      summary: '[Admin] Tổng quan tài chính',
      description: 'Doanh thu gói, doanh thu truyện, phần người bán, hoa hồng, hoàn tiền, chuỗi theo ngày (giờ VN), chi phí AI (quy đổi theo finance.usd_vnd), lãi lỗ, tiền người bán đang giữ.',
      security: bearer,
      parameters: [query('range', { type: 'string', enum: ['today', '7d', '30d', '90d', 'year'] })],
      responses: { 200: { description: '{ range, revenue, series, aiCost, pnl, newParents, activePaidSubscriptions, sellerFunds }' } },
    },
  },
  '/admin/finance/reconciliation': {
    get: { tags: ['Admin'], summary: '[Admin] Đối soát: số dư ví ↔ sổ cái, đơn đã trả không có webhook, bộ đếm truyện', security: bearer, responses: { 200: { description: '{ walletMismatches, paidWithoutWebhook, counterDrift }' } } },
  },
  '/admin/finance/reconciliation/fix-counters': {
    post: { tags: ['Admin'], summary: '[Admin] Tính lại bộ đếm lượt mua / nhận của truyện', security: bearer, responses: { 200: { description: '{ fixed }' } } },
  },
  '/admin/audit-logs': {
    get: {
      tags: ['Admin'],
      summary: '[Admin] Nhật ký thao tác (Admin + Specialist)',
      security: bearer,
      parameters: [query('action', { type: 'string', example: 'refund' }), query('page', { type: 'integer' }), query('limit', { type: 'integer' })],
      responses: { 200: { description: '{ prefixes, logs, pagination }' } },
    },
  },
};
