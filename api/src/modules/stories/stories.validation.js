import { z } from 'zod';

const STORY_LENGTHS = ['short', 'medium', 'long', 'custom'];
const AI_LENGTHS = ['short', 'medium', 'long'];
const STORY_ENTRIES = ['topic', 'family', 'handwritten'];
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

// Loi ke "Ke chuyen nha minh" (spec family-story §3.1): bat buoc 20-2000 ky tu.
const familySituation = z
  .string({ error: 'Lời kể là bắt buộc' })
  .trim()
  .min(20, 'Lời kể cần ít nhất 20 ký tự')
  .max(2000, 'Lời kể không quá 2000 ký tự');

/**
 * Ba loi vao (spec family-story §6.1, A.1):
 * - `length = custom`: tu viet (entry bo trong hoac handwritten), situation tuy chon, topic tuy chon;
 * - `entry = topic` (mac dinh voi do dai AI): bat buoc topicId, KHONG nhan situation;
 * - `entry = family`: bat buoc situation + analysisToken, khong co topicId; `scored` mac dinh true.
 */
const createStory = z.object({
  body: z
    .object({
      entry: z.enum(STORY_ENTRIES, { error: 'Lối vào phải là topic, family hoặc handwritten' }).optional(),
      topicId: uuid('ID chủ đề').optional(),
      length: z.enum(STORY_LENGTHS, { error: 'Độ dài truyện phải là short, medium, long hoặc custom' }),
      title,
      situation: situation.optional(),
      characters,
      analysisToken: z.string().min(1).max(8000).optional(),
      scored: z.boolean().optional(),
      useAiImage: z.boolean().default(false),
      useTts: z.boolean().default(true),
    })
    .superRefine((b, ctx) => {
      const issue = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
      if (b.length === 'custom') {
        if (b.entry && b.entry !== 'handwritten') issue('entry', 'Truyện tự viết không dùng lối vào này');
        return;
      }
      const entry = b.entry ?? 'topic';
      if (entry === 'handwritten') issue('entry', 'Truyện AI chỉ dùng lối vào topic hoặc family');
      if (entry === 'topic') {
        if (!b.topicId) issue('topicId', 'Truyện AI cần chọn chủ đề');
        if (b.situation !== undefined) issue('situation', 'Chuyện mẫu không nhận lời kể; hãy chọn "Kể chuyện nhà mình"');
      }
      if (entry === 'family') {
        if (b.topicId) issue('topicId', 'Kể chuyện nhà mình không chọn chủ đề');
        if (!b.analysisToken) issue('analysisToken', 'Cần phân tích lời kể trước khi tạo truyện');
        const parsed = familySituation.safeParse(b.situation);
        if (!parsed.success) issue('situation', parsed.error.issues[0]?.message ?? 'Lời kể không hợp lệ');
      }
    }),
});

// POST /stories/analyze (spec family-story §5.1, A.1)
const analyzeStory = z.object({
  body: z.object({
    situation: familySituation,
    characters,
    length: z.enum(AI_LENGTHS, { error: 'Độ dài truyện phải là short, medium hoặc long' }),
    subSkillIds: z
      .array(uuid('ID kỹ năng con'))
      .min(1, 'Chọn 1-2 kỹ năng')
      .max(2, 'Chọn tối đa 2 kỹ năng')
      .refine((ids) => new Set(ids).size === ids.length, { message: 'Mỗi kỹ năng chỉ chọn một lần' })
      .optional(),
  }),
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

// Anh bia: canh cua truyen (da co anh), null = ve mac dinh (canh 1).
const setCover = z.object({
  params: storyParams,
  body: z.object({ sceneId: uuid('Mã cảnh').nullable({ error: 'Cần gửi sceneId (mã cảnh hoặc null)' }) }),
});

export default {
  createStory,
  analyzeStory,
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
  setCover,
};
