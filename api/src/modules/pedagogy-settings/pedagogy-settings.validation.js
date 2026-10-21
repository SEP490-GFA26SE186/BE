import { z } from 'zod';

// zod v4: thong bao loi kieu qua `error` (thieu truong -> input undefined).
const num = (label) => z.number({ error: (iss) => (iss.input === undefined ? `Thiếu ${label}` : `${label} phải là số`) });
const int = (label) => num(label).int(`${label} phải là số nguyên`);
const ratio = num;

// 1 <= minItems <= window <= 20; 0 < developingFrom < secureFrom <= 1.
const updateReportSettings = z.object({
  body: z
    .strictObject({
      window: int('số câu xét (window)').min(1, 'Số câu xét tối thiểu là 1').max(20, 'Số câu xét tối đa là 20'),
      minItems: int('số câu tối thiểu (minItems)').min(1, 'Số câu tối thiểu ít nhất là 1'),
      developingFrom: ratio('ngưỡng "Đang phát triển" (developingFrom)').gt(0, 'Ngưỡng "Đang phát triển" phải lớn hơn 0'),
      secureFrom: ratio('ngưỡng "Vững" (secureFrom)').max(1, 'Ngưỡng "Vững" tối đa là 1'),
    }, { error: (iss) => (iss.code === 'unrecognized_keys' ? 'Chỉ nhận window, minItems, developingFrom, secureFrom' : undefined) })
    .superRefine((v, ctx) => {
      if (v.minItems > v.window) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minItems'], message: 'Số câu tối thiểu không được lớn hơn số câu xét' });
      }
      if (!(v.developingFrom < v.secureFrom)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['secureFrom'], message: 'Ngưỡng "Vững" phải lớn hơn ngưỡng "Đang phát triển"' });
      }
    }),
});

export default { updateReportSettings };
