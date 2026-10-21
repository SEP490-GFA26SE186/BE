import { z } from 'zod';

const STORY_LENGTHS = ['short', 'medium', 'long', 'custom'];
const STORY_STATUSES = ['draft', 'generating', 'ready'];
const CHECKPOINT_TYPES = ['emotion_self', 'emotion_other', 'perspective', 'problem_solving', 'reflection'];
const EMOTIONS = ['happy', 'sad', 'angry', 'scared', 'neutral'];
const OPTION_ROLES = ['constructive', 'avoidant', 'impulsive'];
const NEEDS_TARGET = ['emotion_other', 'perspective'];

const uuid = (label) => z.string().uuid(`${label} không hợp lệ`);

const storyParams = z.object({ id: uuid('ID truyện') });
const pageParams = storyParams.extend({ pageId: uuid('ID trang') });
const checkpointParams = storyParams.extend({ cpId: uuid('ID điểm dừng') });

const title = z
  .string({ error: 'Tên truyện là bắt buộc' })
  .trim()
  .min(1, 'Tên truyện không được để trống')
  .max(200, 'Tên truyện không quá 200 ký tự');

const situation = z.string().trim().max(2000, 'Tình huống không quá 2000 ký tự');

// Dung mot isMain, khong trung characterId. Thu tu gui len quyet dinh token {NV2}, {NV3}...
const characters = z
  .array(
    z.object({
      characterId: uuid('ID nhân vật'),
      isMain: z.boolean(),
    }),
  )
  .min(1, 'Truyện cần ít nhất một nhân vật')
  .refine((list) => list.filter((c) => c.isMain).length === 1, {
    message: 'Truyện phải có đúng một nhân vật chính',
  })
  .refine((list) => new Set(list.map((c) => c.characterId)).size === list.length, {
    message: 'Mỗi nhân vật chỉ được chọn một lần',
  });

const createStory = z.object({
  body: z
    .object({
      // Chi truyen tu viet (custom) duoc bo trong topic; truyen AI van bat buoc.
      topicId: uuid('ID chủ đề').optional(),
      length: z.enum(STORY_LENGTHS, { error: 'Độ dài truyện phải là short, medium, long hoặc custom' }),
      title,
      situation: situation.optional(),
      characters,
      useAiImage: z.boolean().default(false),
      useTts: z.boolean().default(true),
    })
    .refine((b) => b.length === 'custom' || b.topicId, { path: ['topicId'], message: 'Truyện AI cần chọn chủ đề' }),
});

const getStories = z.object({
  query: z.object({
    status: z.enum(STORY_STATUSES).optional(),
    // false = chua xem lai (reviewed_at IS NULL), true = da xem lai
    reviewed: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  }),
});

const getStory = z.object({ params: storyParams });

const updateStory = z.object({
  params: storyParams,
  body: z
    .object({
      title: title.optional(),
      situation: situation.nullable().optional(),
      useAiImage: z.boolean().optional(),
      useTts: z.boolean().optional(),
    })
    .refine((b) => Object.values(b).some((v) => v !== undefined), {
      message: 'Cần gửi ít nhất một trường để cập nhật',
    }),
});

const deleteStory = z.object({ params: storyParams });

const bindCharacters = z.object({
  params: storyParams,
  body: z.object({ characters }),
});

// ---------------------------------------------------------------------------
// Editor (spec §4.2). Chu cho phep chuoi rong / null = xoa trang; luat theo kieu diem dung kiem o
// service (lib/editorRules.js) vi kieu nam trong DB.
// ---------------------------------------------------------------------------

const text = (label, max) => z.string({ error: `${label} phải là chuỗi` }).max(max, `${label} không quá ${max} ký tự`);

const pageText = text('Nội dung trang', 2000);

const updatePage = z.object({
  params: pageParams,
  body: z.object({ contentText: pageText.nullable() }),
});

const createPage = z.object({
  params: storyParams,
  body: z.object({ contentText: pageText.nullable().optional() }).default({}),
});

const deletePage = z.object({ params: pageParams });

const checkpointOption = z.object({
  text: text('Phương án', 300).nullable().optional(),
  role: z.enum(OPTION_ROLES, { error: 'Vai của phương án phải là constructive, avoidant hoặc impulsive' }).optional(),
  isCorrect: z.boolean({ error: 'isCorrect phải là true/false' }).optional(),
  feedback: text('Phản hồi', 500).nullable().optional(),
});

const updateCheckpoint = z.object({
  params: checkpointParams,
  body: z
    .object({
      question: text('Câu hỏi', 500).nullable().optional(),
      hint: text('Gợi ý', 500).nullable().optional(),
      answerEmotion: z
        .enum(EMOTIONS, { error: 'Cảm xúc phải là happy, sad, angry, scared hoặc neutral' })
        .optional(),
      options: z.array(checkpointOption, { error: 'Phương án phải là danh sách' }).max(10).optional(),
    })
    .refine((b) => Object.values(b).some((v) => v !== undefined), {
      message: 'Cần gửi ít nhất một trường để cập nhật',
    }),
});

const createCheckpoint = z.object({
  params: storyParams,
  body: z
    .object({
      type: z.enum(CHECKPOINT_TYPES, { error: 'Kiểu điểm dừng không hợp lệ' }),
      afterPageId: uuid('ID trang'),
      targetToken: z.string().regex(/^\{NV\d+\}$/, 'Nhân vật được hỏi không hợp lệ').optional(),
    })
    .refine((b) => b.targetToken === undefined || NEEDS_TARGET.includes(b.type), {
      message: 'Chỉ điểm dừng emotion_other hoặc perspective mới chọn nhân vật được hỏi',
      path: ['targetToken'],
    }),
});

const deleteCheckpoint = z.object({ params: checkpointParams });

const reviewStory = z.object({ params: storyParams });

// Route sinh chu / publish-version: Task 9 bo sung body khi cai handler that.
const storyOnly = z.object({ params: storyParams });
const sceneOnly = z.object({ params: storyParams.extend({ sceneId: z.string().uuid('Mã cảnh không hợp lệ') }) });

export default {
  createStory,
  getStories,
  getStory,
  updateStory,
  deleteStory,
  bindCharacters,
  updatePage,
  createPage,
  deletePage,
  updateCheckpoint,
  createCheckpoint,
  deleteCheckpoint,
  reviewStory,
  storyOnly,
  sceneOnly,
};
