// Quan tri (rev8): tai khoan, goi + bac gia, cau hinh nen tang, nhat ky. Moi thay doi ghi admin_audit_logs.
import bcrypt from 'bcryptjs';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { FREE_PLAN_CODE } from '../billing/lib/billing.js';
import { SETTINGS_REGISTRY, SETTING_GROUPS, describeSettings, settingError } from './lib/settingsRegistry.js';

const TX = { timeout: 20000 };
const vnd = (v) => (v == null ? null : Number(v));
const unprocessable = (message) => new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, message);

const audit = (db, actorId, action, targetType, targetId, beforeState, afterState) =>
  db.adminAuditLog.create({ data: { actorId, action, targetType, targetId, beforeState, afterState } });

// ---------------------------------------------------------------------------
// Tong quan (badge menu)
// ---------------------------------------------------------------------------

export async function overview() {
  const [withdrawals, refunds, appeals] = await Promise.all([
    prisma.withdrawalRequest.count({ where: { status: 'requested' } }),
    prisma.refundRequest.count({ where: { status: 'pending' } }),
    prisma.strikeAppeal.count({ where: { status: 'pending' } }),
  ]);
  return { navBadges: { withdrawals, refunds, appeals } };
}

// ---------------------------------------------------------------------------
// Tai khoan
// ---------------------------------------------------------------------------

/** GET /admin/accounts?role&search&status — phu huynh kem goi dang dung, credit, trang thai ban. */
export async function listAccounts({ role = 'all', search, status = 'all', page = 1, limit = 20 } = {}) {
  const where = {
    deletedAt: null,
    ...(role !== 'all' && { role }),
    ...(status !== 'all' && { isActive: status === 'active' }),
    ...(search?.trim() && {
      OR: ['email', 'username', 'fullName'].map((f) => ({ [f]: { contains: search.trim(), mode: 'insensitive' } })),
    }),
  };
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        wallet: { select: { creditBalance: true } },
        sellerProfile: { select: { displayName: true, status: true } },
        subscriptions: { where: { status: 'active' }, take: 1, include: { plan: { select: { name: true, code: true } } } },
        _count: { select: { childProfiles: true } },
      },
    }),
  ]);
  return {
    accounts: rows.map((u) => ({
      id: u.id,
      role: u.role,
      email: u.email,
      username: u.username,
      fullName: u.fullName,
      isActive: u.isActive,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      plan: u.subscriptions[0]?.plan ?? null,
      creditBalance: u.wallet?.creditBalance ?? null,
      childrenCount: u._count.childProfiles,
      seller: u.sellerProfile,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Khoa / mo khoa (auth chan moi request cua tai khoan is_active = false). Khong tu khoa minh. */
export async function setAccountActive(admin, userId, isActive) {
  if (userId === admin.id) throw unprocessable('Không tự khoá tài khoản của mình.');
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true, isActive: true, role: true } });
  if (!user) throw ApiError.notFound('Không tìm thấy tài khoản.');
  if (user.role === 'admin' && !isActive) throw unprocessable('Không khoá tài khoản Admin khác ở đây.');
  return prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { isActive } });
    // Khoa -> thu hoi phien dang nhap con hieu luc (refresh token) de dang xuat ngay.
    if (!isActive) await tx.authToken.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date() } });
    await audit(tx, admin.id, isActive ? 'account.unlock' : 'account.lock', 'user', userId, { isActive: user.isActive }, { isActive });
    return { id: userId, isActive };
  }, TX);
}

/** Tao tai khoan Kiem duyet vien (chi Admin tao; phu huynh tu dang ky). */
export async function createModerator(admin, { email, username, fullName, password }) {
  const exists = await prisma.user.findFirst({ where: { OR: [{ email: { equals: email, mode: 'insensitive' } }, { username }] }, select: { id: true } });
  if (exists) throw new ApiError(StatusCodes.CONFLICT, 'Email hoặc tên đăng nhập đã được dùng.');
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { role: 'specialist', email, username, fullName, passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: new Date() },
      select: { id: true, email: true, username: true, fullName: true, role: true, isActive: true, createdAt: true },
    });
    await audit(tx, admin.id, 'account.create_moderator', 'user', user.id, null, { email, username });
    return { account: user };
  }, TX);
}

// ---------------------------------------------------------------------------
// Goi + bac gia
// ---------------------------------------------------------------------------

const formatAdminPlan = (p, subscribers) => ({
  id: p.id,
  code: p.code,
  name: p.name,
  durationMonths: p.durationMonths,
  priceVnd: vnd(p.priceVnd),
  creditsPerMonth: p.creditsPerMonth,
  maxChildren: p.maxChildren,
  maxCharacters: p.maxCharacters,
  canSell: p.canSell,
  isActive: p.isActive,
  activeSubscribers: subscribers ?? 0,
});

export async function listAdminPlans() {
  const [plans, counts] = await Promise.all([
    prisma.plan.findMany({ orderBy: [{ priceVnd: 'asc' }, { durationMonths: 'asc' }] }),
    prisma.subscription.groupBy({ by: ['planId'], where: { status: 'active' }, _count: { _all: true } }),
  ]);
  const by = new Map(counts.map((c) => [c.planId, c._count._all]));
  return { plans: plans.map((p) => formatAdminPlan(p, by.get(p.id))) };
}

export async function createPlan(admin, data) {
  if (await prisma.plan.findUnique({ where: { code: data.code } })) throw new ApiError(StatusCodes.CONFLICT, 'Mã gói đã tồn tại.');
  return prisma.$transaction(async (tx) => {
    const plan = await tx.plan.create({ data: { ...data, priceVnd: BigInt(data.priceVnd) } });
    await audit(tx, admin.id, 'plan.create', 'plan', plan.id, null, { ...data });
    return { plan: formatAdminPlan(plan, 0) };
  }, TX);
}

/**
 * Sua goi. Gia / credit moi chi ap dung cho lan mua sau (don cu da chot gia; ky dang chay cap credit theo goi
 * hien tai tu thang ke tiep). Goi Mien phi: gia luon 0, khong tat duoc.
 */
export async function updatePlan(admin, planId, data) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw ApiError.notFound('Không tìm thấy gói.');
  if (plan.code === FREE_PLAN_CODE) {
    if (data.priceVnd !== undefined && data.priceVnd !== 0) throw unprocessable('Gói Miễn phí luôn có giá 0đ.');
    if (data.isActive === false) throw unprocessable('Không tắt được gói Miễn phí (tài khoản mới và tài khoản hết hạn dùng gói này).');
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.plan.update({ where: { id: planId }, data: { ...data, ...(data.priceVnd !== undefined && { priceVnd: BigInt(data.priceVnd) }) } });
    await audit(tx, admin.id, 'plan.update', 'plan', planId, formatAdminPlan(plan), formatAdminPlan(updated));
    return { plan: formatAdminPlan(updated) };
  }, TX);
}

export async function listPriceTiers() {
  const [tiers, counts] = await Promise.all([
    prisma.priceTier.findMany({ orderBy: { priceVnd: 'asc' } }),
    prisma.listing.groupBy({ by: ['priceTierId'], _count: { _all: true } }),
  ]);
  const by = new Map(counts.map((c) => [c.priceTierId, c._count._all]));
  return { tiers: tiers.map((t) => ({ id: t.id, label: t.label, priceVnd: vnd(t.priceVnd), isActive: t.isActive, listingsCount: by.get(t.id) ?? 0 })) };
}

export async function createPriceTier(admin, { label, priceVnd }) {
  if (await prisma.priceTier.findUnique({ where: { priceVnd: BigInt(priceVnd) } })) throw new ApiError(StatusCodes.CONFLICT, 'Đã có bậc giá với số tiền này.');
  return prisma.$transaction(async (tx) => {
    const t = await tx.priceTier.create({ data: { label: label.trim(), priceVnd: BigInt(priceVnd) } });
    await audit(tx, admin.id, 'price_tier.create', 'price_tier', t.id, null, { label, priceVnd });
    return { tier: { id: t.id, label: t.label, priceVnd: vnd(t.priceVnd), isActive: t.isActive, listingsCount: 0 } };
  }, TX);
}

/** Sua nhan / bat tat. Doi so tien chi khi chua co truyen nao dung (gia truyen dang ban = gia bac). */
export async function updatePriceTier(admin, tierId, data) {
  const tier = await prisma.priceTier.findUnique({ where: { id: tierId } });
  if (!tier) throw ApiError.notFound('Không tìm thấy bậc giá.');
  const used = await prisma.listing.count({ where: { priceTierId: tierId } });
  if (data.priceVnd !== undefined && BigInt(data.priceVnd) !== tier.priceVnd) {
    if (used) throw unprocessable(`Bậc giá đang có ${used} truyện dùng nên không đổi được số tiền. Hãy tạo bậc giá mới.`);
    if (await prisma.priceTier.findUnique({ where: { priceVnd: BigInt(data.priceVnd) } })) throw new ApiError(StatusCodes.CONFLICT, 'Đã có bậc giá với số tiền này.');
  }
  return prisma.$transaction(async (tx) => {
    const t = await tx.priceTier.update({
      where: { id: tierId },
      data: { ...(data.label !== undefined && { label: data.label.trim() }), ...(data.isActive !== undefined && { isActive: data.isActive }), ...(data.priceVnd !== undefined && { priceVnd: BigInt(data.priceVnd) }) },
    });
    await audit(tx, admin.id, 'price_tier.update', 'price_tier', tierId, { label: tier.label, priceVnd: vnd(tier.priceVnd), isActive: tier.isActive }, data);
    return { tier: { id: t.id, label: t.label, priceVnd: vnd(t.priceVnd), isActive: t.isActive, listingsCount: used } };
  }, TX);
}

// ---------------------------------------------------------------------------
// Cau hinh
// ---------------------------------------------------------------------------

const settingRows = (db = prisma) =>
  db.platformSetting.findMany({ where: { key: { in: Object.keys(SETTINGS_REGISTRY) } }, include: { updater: { select: { fullName: true } } } });

export async function getSettings() {
  return { groups: SETTING_GROUPS, settings: describeSettings(await settingRows()) };
}

/** PUT /admin/settings/:key { value } — kiem tra theo registry (ca rang buoc cheo), ghi nhat ky. */
export async function updateSetting(admin, key, value) {
  return prisma.$transaction(async (tx) => {
    const current = Object.fromEntries(describeSettings(await settingRows(tx)).map((s) => [s.key, s.value]));
    const error = settingError(key, value, current);
    if (error) throw unprocessable(error);
    await tx.platformSetting.upsert({ where: { key }, create: { key, value, updatedBy: admin.id }, update: { value, updatedBy: admin.id } });
    await audit(tx, admin.id, 'setting.update', 'platform_setting', null, { key, value: current[key] }, { key, value });
    return { setting: describeSettings(await settingRows(tx)).find((s) => s.key === key) };
  }, TX);
}

// ---------------------------------------------------------------------------
// Nhat ky
// ---------------------------------------------------------------------------

const ACTION_PREFIXES = ['account', 'plan', 'price_tier', 'setting', 'refund', 'withdrawal', 'appeal', 'strike', 'listing', 'report', 'audit', 'reconcile'];

export async function listAuditLogs({ action, actorId, page = 1, limit = 30 } = {}) {
  const where = { ...(action && action !== 'all' && { action: { startsWith: `${action}.` } }), ...(actorId && { actorId }) };
  const [total, rows] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit, include: { actor: { select: { fullName: true, role: true } } } }),
  ]);
  return {
    prefixes: ACTION_PREFIXES,
    logs: rows.map((l) => ({
      id: Number(l.id),
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      beforeState: l.beforeState,
      afterState: l.afterState,
      createdAt: l.createdAt,
      actor: { name: l.actor.fullName, role: l.actor.role },
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export default {
  overview, listAccounts, setAccountActive, createModerator,
  listAdminPlans, createPlan, updatePlan, listPriceTiers, createPriceTier, updatePriceTier,
  getSettings, updateSetting, listAuditLogs,
};
