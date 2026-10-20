import { z } from 'zod';

const uuid = z.string().uuid('id không hợp lệ');
const format = z.enum(['emotion_pick', 'single_correct', 'role_choice']);
const emotion = z.enum(['happy', 'sad', 'angry', 'scared', 'neutral']);
const text = z.string().trim().max(4000);
const score = z.number().min(0, 'Điểm từ 0 đến 1').max(1, 'Điểm từ 0 đến 1');

const list = z.object({
  query: z.object({
    subSkillId: uuid.optional(),
    skillId: uuid.optional(),
    isActive: z.enum(['true', 'false']).optional(),
  }),
});
const create = z.object({
  body: z.object({
    subSkillId: uuid,
    title: z.string().trim().min(3, 'Tên mẫu tối thiểu 3 ký tự').max(200),
    answerFormat: format,
  }),
});
const update = z.object({
  params: z.object({ id: uuid }),
  body: z.object({ title: z.string().trim().min(3).max(200).optional(), isActive: z.boolean().optional() }).refine((b) => Object.keys(b).length > 0, 'Không có gì để sửa'),
});
// Noi dung nhap: moi truong tuy chon (nhap duoc phep do); du/thieu kiem khi ban hanh.
const draft = z.object({
  params: z.object({ id: uuid }),
  body: z
    .object({
      questionFrame: text,
      pageSetup: text.nullable(),
      needsTarget: z.boolean(),
      allowedEmotions: z.array(emotion).max(5),
      correctDesc: text.nullable(),
      distractorDesc: text.nullable(),
      constructiveDesc: text.nullable(),
      avoidantDesc: text.nullable(),
      impulsiveDesc: text.nullable(),
      constructiveScore: score.nullable(),
      avoidantScore: score.nullable(),
      impulsiveScore: score.nullable(),
      hintGuidance: text.nullable(),
      parentPrompts: z.array(z.string().trim().min(1).max(500)).max(5),
      rationale: text.nullable(),
      referenceUrl: z.string().trim().url('Đường dẫn không hợp lệ').max(500).nullable(),
    })
    .partial(),
});
const id = z.object({ params: z.object({ id: uuid }) });

export default { list, create, update, draft, publish: id, remove: id };
