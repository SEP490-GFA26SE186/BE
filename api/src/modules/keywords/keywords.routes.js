// Tu khoa bi chan (blocked_keywords, rev8). Specialist quan ly; dung o hai noi:
// - gui sang ai/ moi lan sinh truyen (validator: block -> viet lai / loi, warn -> canh bao);
// - kiem chu phu huynh tu viet / sua trong editor (stories/lib/keywords.js: block chan han, warn canh bao).
// Thay route /moderation/keywords cu (ghi sai cot createdById). Gan TRUOC router moderation cu.
import { Router } from 'express';
import { z } from 'zod';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/index.js';
import ApiError from '../../utils/ApiError.js';
import { auth, authorize, validate } from '../../middlewares/index.js';
import { ApiResponse, catchAsync } from '../../utils/index.js';

const router = Router();
const mod = [auth, authorize('specialist', 'admin')];
const ok = (fn, statusCode) => catchAsync(async (req, res) => ApiResponse.success(res, { ...(statusCode && { statusCode }), data: await fn(req) }));

const keyword = z.string().trim().min(1, 'Nhập từ khoá').max(100).transform((s) => s.normalize('NFC').toLocaleLowerCase('vi'));
const severity = z.enum(['block', 'warn']);
const format = (k) => ({ id: k.id, keyword: k.keyword, severity: k.severity, isActive: k.isActive, createdAt: k.createdAt, creator: k.creator?.fullName ?? null });
const include = { creator: { select: { fullName: true } } };

router.get(
  '/keywords',
  ...mod,
  validate(z.object({ query: z.object({ search: z.string().max(100).optional(), severity: severity.optional() }) })),
  ok(async (req) => {
    const rows = await prisma.blockedKeyword.findMany({
      where: {
        ...(req.query.search && { keyword: { contains: req.query.search.trim(), mode: 'insensitive' } }),
        ...(req.query.severity && { severity: req.query.severity }),
      },
      orderBy: [{ isActive: 'desc' }, { keyword: 'asc' }],
      include,
    });
    return { keywords: rows.map(format) };
  }),
);

router.post(
  '/keywords',
  ...mod,
  validate(z.object({ body: z.object({ keyword, severity: severity.default('block') }) })),
  ok(async (req) => {
    if (await prisma.blockedKeyword.findUnique({ where: { keyword: req.body.keyword } })) {
      throw new ApiError(StatusCodes.CONFLICT, 'Từ khoá đã có trong danh sách.');
    }
    const k = await prisma.blockedKeyword.create({ data: { ...req.body, createdBy: req.user.id }, include });
    return { keyword: format(k) };
  }, StatusCodes.CREATED),
);

// Them nhieu tu mot lan (moi dong mot tu); tu da co -> cap nhat muc do + bat lai.
router.post(
  '/keywords/bulk',
  ...mod,
  validate(z.object({ body: z.object({ keywords: z.array(keyword).min(1).max(500), severity: severity.default('block') }) })),
  ok(async (req) => {
    const unique = [...new Set(req.body.keywords)];
    await prisma.$transaction(
      unique.map((kw) =>
        prisma.blockedKeyword.upsert({
          where: { keyword: kw },
          create: { keyword: kw, severity: req.body.severity, createdBy: req.user.id },
          update: { severity: req.body.severity, isActive: true },
        }),
      ),
    );
    return { count: unique.length };
  }),
);

router.put(
  '/keywords/:id',
  ...mod,
  validate(z.object({ params: z.object({ id: z.string().uuid() }), body: z.object({ severity: severity.optional(), isActive: z.boolean().optional() }) })),
  ok(async (req) => {
    const k = await prisma.blockedKeyword.update({ where: { id: req.params.id }, data: req.body, include }).catch(() => null);
    if (!k) throw ApiError.notFound('Không tìm thấy từ khoá.');
    return { keyword: format(k) };
  }),
);

router.delete(
  '/keywords/:id',
  ...mod,
  validate(z.object({ params: z.object({ id: z.string().uuid() }) })),
  ok(async (req) => {
    const { count } = await prisma.blockedKeyword.deleteMany({ where: { id: req.params.id } });
    if (!count) throw ApiError.notFound('Không tìm thấy từ khoá.');
    return { deleted: true };
  }),
);

export default router;
