import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

const createChild = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Tên bé là bắt buộc' })
      .trim()
      .min(1, 'Tên bé không được để trống')
      .max(100, 'Tên bé tối đa 100 ký tự'),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày sinh phải có định dạng YYYY-MM-DD')
      .optional(),
    dailyScreenTimeMinutes: z
      .number({ invalid_type_error: 'Thời gian màn hình phải là số phút' })
      .int('Thời gian màn hình phải là số nguyên')
      .min(5, 'Thời gian tối thiểu là 5 phút')
      .max(300, 'Thời gian tối đa là 300 phút')
      .optional()
      .default(30),
    bedtimeStart: z
      .string()
      .regex(timeRegex, 'Giờ bắt đầu đi ngủ phải có định dạng HH:mm (ví dụ 21:00)')
      .optional(),
    bedtimeEnd: z
      .string()
      .regex(timeRegex, 'Giờ kết thúc đi ngủ phải có định dạng HH:mm (ví dụ 06:00)')
      .optional(),
    preferredVoice: z
      .string()
      .trim()
      .max(50, 'Giọng đọc tối đa 50 ký tự')
      .optional(),
  }),
});

const updateChild = z.object({
  params: z.object({
    id: z.string().uuid('ID hồ sơ bé không hợp lệ'),
  }),
  body: z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Tên bé không được để trống')
      .max(100, 'Tên bé tối đa 100 ký tự')
      .optional(),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày sinh phải có định dạng YYYY-MM-DD')
      .optional(),
    dailyScreenTimeMinutes: z
      .number({ invalid_type_error: 'Thời gian màn hình phải là số phút' })
      .int('Thời gian màn hình phải là số nguyên')
      .min(5, 'Thời gian tối thiểu là 5 phút')
      .max(300, 'Thời gian tối đa là 300 phút')
      .optional(),
    bedtimeStart: z
      .string()
      .regex(timeRegex, 'Giờ bắt đầu đi ngủ phải có định dạng HH:mm (ví dụ 21:00)')
      .nullable()
      .optional(),
    bedtimeEnd: z
      .string()
      .regex(timeRegex, 'Giờ kết thúc đi ngủ phải có định dạng HH:mm (ví dụ 06:00)')
      .nullable()
      .optional(),
    preferredVoice: z
      .string()
      .trim()
      .max(50, 'Giọng đọc tối đa 50 ký tự')
      .nullable()
      .optional(),
  }),
});

const getChild = z.object({
  params: z.object({
    id: z.string().uuid('ID hồ sơ bé không hợp lệ'),
  }),
});

const deleteChild = z.object({
  params: z.object({
    id: z.string().uuid('ID hồ sơ bé không hợp lệ'),
  }),
});

const getUsage = z.object({
  params: z.object({
    id: z.string().uuid('ID hồ sơ bé không hợp lệ'),
  }),
  query: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày tra cứu phải có định dạng YYYY-MM-DD')
      .optional(),
  }),
});

const logUsageSession = z.object({
  params: z.object({
    id: z.string().uuid('ID hồ sơ bé không hợp lệ'),
  }),
  body: z.object({
    startedAt: z.string().datetime({ message: 'Thời gian bắt đầu phải là chuẩn ISO 8601' }).optional(),
    endedAt: z.string().datetime({ message: 'Thời gian kết thúc phải là chuẩn ISO 8601' }).optional(),
    durationSeconds: z.number().int().min(1, 'Thời lượng tối thiểu là 1 giây'),
  }),
});

export default {
  createChild,
  updateChild,
  getChild,
  deleteChild,
  getUsage,
  logUsageSession,
};
