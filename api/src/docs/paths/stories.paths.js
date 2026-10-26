// Swagger cho module stories (spec Node §4). Body/response dung camelCase.
// Chu truyen luon o dang token {NVn}; `characters` la bang token -> ten de frontend thay khi hien thi.

const bearer = [{ BearerAuth: [] }];
const uuid = { type: 'string', format: 'uuid' };
const idParam = { name: 'id', in: 'path', required: true, description: 'ID truyện', schema: uuid };
const pageIdParam = { name: 'pageId', in: 'path', required: true, description: 'ID trang', schema: uuid };
const cpIdParam = { name: 'cpId', in: 'path', required: true, description: 'ID điểm dừng', schema: uuid };

const OWNER = '**Quyền truy cập:** phụ huynh sở hữu truyện.';
const CUSTOM_ONLY = 'Chỉ truyện `length = custom`; truyện khác trả `422`.';
const LOCKED = 'Truyện đang `generating` trả `409` (mọi thao tác sửa đều bị khoá).';

const resp = (description, example) => ({
  description,
  ...(example && { content: { 'application/json': { example } } }),
});
const err = (description) => ({ description });

const storyCharacterInput = {
  type: 'object',
  required: ['characterId', 'isMain'],
  properties: {
    characterId: { ...uuid, description: 'ID nhân vật của phụ huynh (hoặc hồ sơ bé)' },
    isMain: { type: 'boolean', description: 'Đúng một nhân vật chính' },
  },
};

const charactersInput = {
  type: 'array',
  minItems: 1,
  description:
    'Đúng một `isMain = true`, không trùng `characterId`. **Thứ tự gửi lên quyết định token**: nhân vật chính là `{NV1}`, các nhân vật phụ là `{NV2}`, `{NV3}`… theo thứ tự.',
  items: storyCharacterInput,
};

const storyDetailExample = {
  id: '7b1e4c1a-0d5e-4c55-9a53-1f1c2d3e4f50',
  kind: 'private',
  topicId: '11111111-2222-3333-4444-555555555555',
  topic: { id: '11111111-2222-3333-4444-555555555555', title: 'Chia sẻ đồ chơi', competency: 'relationship_skills' },
  length: 'short',
  entry: 'topic',
  scored: true,
  title: 'Bo và chiếc xe cứu hỏa',
  situation: null,
  momentSummary: null, // truyen family: khoanh khac kho (da thay ten that)
  seedEvent: null, // truyen family: tinh tiet AI them (da thay ten that)
  subSkills: [], // truyen family: [{ id, nameVi, source: moment|need|parent, position }] (1 = ky nang chinh)
  useAiImage: false,
  useTts: true,
  status: 'ready',
  reviewedAt: null,
  createdAt: '2026-09-30T08:00:00.000Z',
  updatedAt: '2026-09-30T08:05:00.000Z',
  // Anh bia (StoryCover): canh da chon / canh 1 neu da co anh; null -> Web ve bia theo mau nang luc
  cover: { imageUrl: null, competency: 'relationship_skills' },
  coverSceneId: null, // chi co o chi tiet; null = mac dinh (canh 1)
  characters: [
    { token: '{NV1}', characterId: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Bo', isMain: true },
    { token: '{NV2}', characterId: 'aaaaaaaa-0000-4000-8000-000000000002', name: 'Mẹ Lan', isMain: false },
  ],
  scenes: [
    {
      id: 'bbbbbbbb-0000-4000-8000-000000000001',
      sceneOrder: 1,
      description: 'Sân chơi trước nhà',
      imageKey: null,
      imageUrl: null, // link Cloudinary co chu ky khi da co anh
      imageStatus: 'none',
    },
  ],
  pages: [
    {
      id: 'cccccccc-0000-4000-8000-000000000001',
      pageOrder: 1,
      sceneId: 'bbbbbbbb-0000-4000-8000-000000000001',
      contentText: '{NV1} đang chơi xe cứu hỏa thì {NV2} gọi vào ăn cơm.',
      origin: 'ai',
      audioKey: null,
      audioUrl: null,
      audioStatus: 'none',
    },
  ],
  checkpoints: [
    {
      id: 'dddddddd-0000-4000-8000-000000000001',
      afterPageId: 'cccccccc-0000-4000-8000-000000000001',
      afterPageOrder: 1,
      type: 'emotion_self',
      targetToken: '{NV1}',
      question: '{NV1} đang cảm thấy thế nào?',
      answerEmotion: 'sad',
      hint: 'Nhìn vào khuôn mặt của {NV1} nhé.',
      origin: 'ai',
      options: [
        {
          id: 'eeeeeeee-0000-4000-8000-000000000001',
          optionOrder: 1,
          text: 'Buồn',
          role: null,
          isCorrect: true,
          feedback: 'Đúng rồi, {NV1} đang buồn.',
        },
      ],
    },
  ],
};

const detailResponse = (description) => resp(description, { success: true, data: { story: storyDetailExample } });

const editorErrors = {
  401: err('Chưa đăng nhập'),
  403: err('Không phải chủ truyện'),
  404: err('Không tìm thấy truyện / trang / điểm dừng'),
  409: err('Truyện đang được AI viết (`generating`)'),
};

const storiesPaths = {
  '/stories/analyze': {
    post: {
      tags: ['Stories'],
      summary: '[Parent] Phân tích lời kể "Kể chuyện nhà mình"',
      description:
        '**Quyền truy cập:** phụ huynh. Gọi đồng bộ AI (có thể 10–90 giây), **không trừ credit**; tối đa ' +
        '`limits.story_analysis_per_day` lượt/ngày (mặc định 30). Lời kể được thay tên thật bằng token trước khi gửi AI. ' +
        'AI tìm khoảnh khắc khó (`momentSummary`) hoặc, nếu không có, thêm một tình tiết nhỏ (`seedEvent`), và chọn 1–2 kỹ năng con ' +
        'trong danh mục đang dùng (`position` 1 = kỹ năng chính). "Đổi kỹ năng": gửi lại kèm `subSkillIds` → token mới. ' +
        'Chữ trả về đã thay tên thật. Gửi `analysisToken` vào `POST /stories` với `entry = family`.',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['situation', 'characters', 'length'],
              properties: {
                situation: { type: 'string', minLength: 20, maxLength: 2000, example: 'Bin đang xếp lego thì em Na làm đổ, Bin hét lên và đẩy em ngã.' },
                characters: charactersInput,
                length: { type: 'string', enum: ['short', 'medium', 'long'] },
                subSkillIds: { type: 'array', minItems: 1, maxItems: 2, items: uuid, description: 'Kỹ năng phụ huynh chọn (đầu = kỹ năng chính)' },
              },
            },
          },
        },
      },
      responses: {
        200: resp('Kết quả phân tích', {
          success: true,
          data: {
            momentSummary: 'Bin giận khi em Na làm đổ tháp lego',
            seedEvent: null,
            subSkills: [
              {
                id: '11111111-0000-4000-8000-000000000001',
                code: 'sm_managing_emotions',
                nameVi: 'Bình tĩnh lại khi cảm xúc mạnh',
                descriptionVi: '…',
                skill: { id: '22222222-0000-4000-8000-000000000001', caselCode: 'self_management', nameVi: 'Tự quản lý' },
                source: 'moment',
                position: 1,
              },
            ],
            analysisToken: 'eyJ2IjoxfQ.c2ln',
            expiresAt: '2026-10-22T10:00:00.000Z',
          },
        }),
        400: err('Dữ liệu không hợp lệ'),
        403: err('Không phải phụ huynh, hoặc quyền dùng AI đang tạm khoá'),
        422: err('Lời kể có từ khoá chặn / tên con chưa là nhân vật, hoặc kỹ năng đã chọn chưa dùng được'),
        429: err('Quá số lượt phân tích trong ngày'),
        502: err('AI lỗi: "Chưa phân tích được, thử lại"'),
      },
    },
  },

  '/stories': {
    post: {
      tags: ['Stories'],
      summary: '[Parent] Tạo truyện nháp',
      description:
        `${OWNER}\nTạo truyện \`kind = private\`, \`status = draft\` cùng khung trang/cảnh/điểm dừng trống, dựng theo \`length\` ` +
        '(cấu hình `story_layout.*` trong `platform_settings`). Chưa có chữ và chưa tốn credit; gọi `POST /stories/{id}/generate` để AI viết chữ.\n\n' +
        'Ba lối vào (`entry`):\n' +
        '- `topic` (Chuyện mẫu, mặc định khi thiếu `entry` với độ dài AI): bắt buộc `topicId`; **gửi `situation` → 400**.\n' +
        '- `family` (Kể chuyện nhà mình): bắt buộc `situation` (20–2000 ký tự, khớp lời kể đã phân tích) + `analysisToken` từ ' +
        '`POST /stories/analyze` + `characters` giống hệt lúc phân tích; không có `topicId`. `scored = false` ("Chỉ kể truyện"): ' +
        'chỉ giữ điểm dừng `reflection`. Token sai / hết hạn / không khớp → `422` (phân tích lại). Ô chấm thứ hai (hoặc ô cuối nếu chỉ 1) ' +
        'luôn đo kỹ năng chính.\n' +
        '- `length = custom` (tự viết): server đặt `entry = handwritten`; `situation`, `topicId` tuỳ chọn, phụ huynh tự viết.\n\n' +
        'Nếu `situation` chứa tên bé chưa có trong truyện, trả `422`.',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['length', 'title', 'characters'],
              properties: {
                entry: { type: 'string', enum: ['topic', 'family', 'handwritten'], description: 'Thiếu với độ dài AI → `topic`; `custom` → `handwritten`' },
                topicId: { ...uuid, description: 'ID chuyện mẫu (topic) — bắt buộc với `entry = topic`' },
                length: { type: 'string', enum: ['short', 'medium', 'long', 'custom'] },
                title: { type: 'string', maxLength: 200, example: 'Bo và chiếc xe cứu hỏa' },
                situation: { type: 'string', maxLength: 2000, description: 'Chỉ `family` (bắt buộc, ≥ 20 ký tự) và `custom`', example: 'Bo đang xếp lego thì em làm đổ tháp, Bo giận và đẩy em.' },
                analysisToken: { type: 'string', description: '`family`: token từ `POST /stories/analyze` (hạn 2 giờ)' },
                scored: { type: 'boolean', default: true, description: '`family`: false = "Chỉ kể truyện" (không chấm điểm)' },
                characters: charactersInput,
                useAiImage: { type: 'boolean', default: false },
                useTts: { type: 'boolean', default: true },
              },
            },
          },
        },
      },
      responses: {
        201: detailResponse('Tạo truyện thành công, trả chi tiết truyện (chưa có chữ)'),
        400: err('Dữ liệu không hợp lệ (thiếu nhân vật chính, trùng nhân vật, chuyện mẫu gửi `situation`…)'),
        422: err('Tình huống chứa tên bé chưa có trong truyện, thiếu nhân vật phụ, hoặc `analysisToken` không còn dùng được / kỹ năng chính hết câu hỏi (phân tích lại)'),
      },
    },
    get: {
      tags: ['Stories'],
      summary: '[Parent] Danh sách truyện của tôi',
      description: '**Quyền truy cập:** người dùng đã đăng nhập. Trả truyện của chính mình, có phân trang, lọc theo `status`.',
      security: bearer,
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'generating', 'ready'] } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
      ],
      responses: {
        200: resp('Danh sách truyện (phân trang); mỗi phần tử là tóm tắt kèm `characters`, `pageCount` và `cover` (`StoryCover`)'),
        401: err('Chưa đăng nhập'),
      },
    },
  },

  '/stories/{id}': {
    get: {
      tags: ['Stories'],
      summary: '[Parent | Specialist | Admin] Chi tiết truyện',
      description:
        '**Quyền truy cập:** phụ huynh sở hữu truyện; `specialist`, `admin` được đọc.\n' +
        'Trả trang, cảnh, điểm dừng, phương án và nhân vật. Chữ truyện **giữ dạng token** `{NV1}`, `{NV2}`…; ' +
        'frontend thay token bằng tên khi hiển thị, dùng bảng `characters` (`token → name`).',
      security: bearer,
      parameters: [idParam],
      responses: {
        200: detailResponse('Chi tiết truyện'),
        401: err('Chưa đăng nhập'),
        403: err('Không có quyền xem truyện này'),
        404: err('Không tìm thấy truyện'),
      },
    },
    put: {
      tags: ['Stories'],
      summary: '[Parent] Sửa thông tin truyện',
      description:
        `${OWNER}\nSửa \`title\`, \`situation\`, \`useAiImage\`, \`useTts\`. Cần gửi ít nhất một trường. ${LOCKED}\n` +
        'Truyện `entry = family`: gửi `situation` → `409` ("Muốn đổi lời kể hay nhân vật, hãy tạo truyện mới").',
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string', maxLength: 200 },
                situation: { type: 'string', nullable: true, maxLength: 2000 },
                useAiImage: { type: 'boolean' },
                useTts: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        200: detailResponse('Cập nhật thành công'),
        ...editorErrors,
        422: err('Tình huống chứa tên bé chưa có trong truyện'),
      },
    },
    delete: {
      tags: ['Stories'],
      summary: '[Parent] Xoá mềm truyện',
      description:
        `${OWNER}\nĐặt \`deleted_at\`. **Được phép xoá cả khi đang \`generating\`**: worker sẽ không ghi nội dung vào truyện đã xoá, ` +
        'credit vẫn bị trừ (AI đã chạy), không có lỗi.',
      security: bearer,
      parameters: [idParam],
      responses: {
        200: resp('Đã xoá truyện'),
        401: err('Chưa đăng nhập'),
        403: err('Không phải chủ truyện'),
        404: err('Không tìm thấy truyện'),
      },
    },
  },

  '/stories/{id}/cover': {
    put: {
      tags: ['Stories'],
      summary: '[Parent] Chọn ảnh bìa (ảnh một cảnh)',
      description:
        `${OWNER} Chỉ truyện riêng (\`kind = private\`), chưa xoá.\n` +
        'Ảnh bìa = ảnh một cảnh của truyện (1024x1024, không chữ). `sceneId` phải thuộc truyện và ảnh đã vẽ xong ' +
        '(`imageStatus = ready`), không thì `422` "Cảnh này chưa có ảnh". `sceneId = null` → về mặc định (cảnh 1). ' +
        'Trả chi tiết truyện (như `GET /stories/{id}`) với `coverSceneId` và `cover` mới.',
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['sceneId'],
              properties: { sceneId: { ...uuid, nullable: true, description: 'ID cảnh làm bìa; null = cảnh 1' } },
            },
            example: { sceneId: 'bbbbbbbb-0000-4000-8000-000000000001' },
          },
        },
      },
      responses: {
        200: detailResponse('Đã đổi ảnh bìa'),
        400: err('`sceneId` thiếu hoặc không phải uuid'),
        401: err('Chưa đăng nhập'),
        403: err('Không phải phụ huynh / không phải chủ truyện'),
        404: err('Không tìm thấy truyện'),
        422: err('Cảnh này chưa có ảnh (chưa vẽ xong, hoặc không thuộc truyện)'),
      },
    },
  },

  '/stories/{id}/characters': {
    put: {
      tags: ['Stories'],
      summary: '[Parent] Đổi nhân vật của truyện',
      description:
        `${OWNER}\nChỉ đổi được khi **chưa trang nào có chữ** (đổi sau khi có chữ làm token trỏ sai người). ` +
        'Token của điểm dừng được đưa về nhân vật phụ đầu tiên mới. Truyện `entry = family` luôn trả `409`. ' +
        LOCKED,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['characters'], properties: { characters: charactersInput } },
          },
        },
      },
      responses: {
        200: detailResponse('Đổi nhân vật thành công'),
        ...editorErrors,
        409: err('Truyện đang `generating`, hoặc đã có trang có chữ'),
        422: err('Thiếu nhân vật phụ cho câu hỏi về nhân vật khác, hoặc tình huống còn nhắc nhân vật bị bỏ'),
      },
    },
  },

  '/stories/{id}/pages': {
    post: {
      tags: ['Stories'],
      summary: '[Parent] Thêm trang (chỉ truyện custom)',
      description: `${OWNER}\n${CUSTOM_ONLY} Luật \`custom\` (\`custom_limits.*\`): 4–20 trang. ${LOCKED}`,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { contentText: { type: 'string', nullable: true, maxLength: 2000 } },
            },
          },
        },
      },
      responses: {
        201: detailResponse('Đã thêm trang; trả chi tiết truyện với trang đã đánh số lại'),
        ...editorErrors,
        422: err('Không phải truyện `custom`, hoặc vượt số trang tối đa'),
      },
    },
  },

  '/stories/{id}/pages/{pageId}': {
    put: {
      tags: ['Stories'],
      summary: '[Parent] Sửa chữ của trang',
      description:
        `${OWNER}\nChữ đi qua \`tokenizeNames\` (tên thật thành token) trước khi lưu. \`origin = ai\` chuyển thành \`ai_edited\`; xoá \`audioKey\`. ` +
        '`contentText` rỗng hoặc `null` là xoá chữ trang. Sau khi sửa: mọi trang có chữ thì truyện thành `ready`, còn trang trống thì `draft`; ' +
        `**không** xoá \`reviewedAt\`. ${LOCKED}`,
      security: bearer,
      parameters: [idParam, pageIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['contentText'],
              properties: {
                contentText: { type: 'string', nullable: true, maxLength: 2000, example: 'Bo đưa xe cứu hỏa cho bạn chơi cùng.' },
              },
            },
          },
        },
      },
      responses: {
        200: detailResponse('Đã lưu trang'),
        ...editorErrors,
        422: err('Chữ chứa tên bé chưa có trong truyện'),
      },
    },
    delete: {
      tags: ['Stories'],
      summary: '[Parent] Xoá trang (chỉ truyện custom)',
      description: `${OWNER}\n${CUSTOM_ONLY} Không xoá được trang đang có điểm dừng đặt sau nó (\`409\`); tối thiểu 4 trang. ${LOCKED}`,
      security: bearer,
      parameters: [idParam, pageIdParam],
      responses: {
        200: detailResponse('Đã xoá trang'),
        ...editorErrors,
        422: err('Không phải truyện `custom`, hoặc dưới số trang tối thiểu'),
      },
    },
  },

  '/stories/{id}/checkpoints': {
    post: {
      tags: ['Stories'],
      summary: '[Parent] Thêm điểm dừng (chỉ truyện custom)',
      description:
        `${OWNER}\n${CUSTOM_ONLY} Luật \`custom\`: 0–6 điểm dừng có chấm, tối đa 1 điểm dừng mỗi trang, không đặt sau trang 1, ` +
        `\`reflection\` chỉ ở trang cuối. \`targetToken\` chỉ dùng cho \`emotion_other\` và \`perspective\`. ${LOCKED}`,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['type', 'afterPageId'],
              properties: {
                type: {
                  type: 'string',
                  enum: ['emotion_self', 'emotion_other', 'perspective', 'problem_solving', 'reflection'],
                },
                afterPageId: uuid,
                targetToken: { type: 'string', pattern: '^\\{NV\\d+\\}$', example: '{NV2}' },
              },
            },
          },
        },
      },
      responses: {
        201: detailResponse('Đã thêm điểm dừng'),
        ...editorErrors,
        422: err('Không phải truyện `custom`, hoặc vi phạm luật đặt điểm dừng'),
      },
    },
  },

  '/stories/{id}/checkpoints/{cpId}': {
    put: {
      tags: ['Stories'],
      summary: '[Parent] Sửa điểm dừng',
      description:
        `${OWNER}\nSửa \`question\`, \`hint\`, \`answerEmotion\`, \`options\`. Kiểm đủ trường theo kiểu điểm dừng. ` +
        `\`origin = ai\` chuyển thành \`ai_edited\`. ${LOCKED}`,
      security: bearer,
      parameters: [idParam, cpIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                question: { type: 'string', nullable: true, maxLength: 500 },
                hint: { type: 'string', nullable: true, maxLength: 500 },
                answerEmotion: { type: 'string', enum: ['happy', 'sad', 'angry', 'scared', 'neutral'] },
                options: {
                  type: 'array',
                  maxItems: 10,
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string', nullable: true, maxLength: 300 },
                      role: { type: 'string', enum: ['constructive', 'avoidant', 'impulsive'] },
                      isCorrect: { type: 'boolean' },
                      feedback: { type: 'string', nullable: true, maxLength: 500 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        200: detailResponse('Đã lưu điểm dừng'),
        400: err('Nội dung điểm dừng không hợp lệ theo kiểu'),
        ...editorErrors,
      },
    },
    delete: {
      tags: ['Stories'],
      summary: '[Parent] Xoá điểm dừng (chỉ truyện custom)',
      description: `${OWNER}\n${CUSTOM_ONLY} ${LOCKED}`,
      security: bearer,
      parameters: [idParam, cpIdParam],
      responses: {
        200: detailResponse('Đã xoá điểm dừng'),
        ...editorErrors,
        422: err('Không phải truyện `custom`'),
      },
    },
  },

  '/stories/{id}/review': {
    post: {
      tags: ['Stories'],
      summary: '[Parent] Đánh dấu đã xem xong',
      description:
        `${OWNER}\nĐặt \`reviewedAt\`. Chỉ nhận khi mọi trang có chữ và mọi điểm dừng đủ trường theo kiểu. ${LOCKED}`,
      security: bearer,
      parameters: [idParam],
      responses: {
        200: detailResponse('Đã đánh dấu truyện là đã xem xong'),
        ...editorErrors,
        422: err('Truyện còn chỗ chưa viết xong'),
      },
    },
  },

  '/stories/{id}/publish-version': {
    post: {
      tags: ['Stories'],
      summary: '[Parent] Đăng bán (chưa hỗ trợ)',
      description: 'Luôn trả `501` cho tới khi có spec chợ truyện.',
      security: bearer,
      parameters: [idParam],
      responses: {
        501: err('Chức năng đăng bán sẽ có ở bản sau'),
      },
    },
  },

  '/stories/{id}/generate': {
    post: {
      tags: ['Stories'],
      summary: '[Parent] Nhờ AI viết chữ cho truyện',
      description:
        `${OWNER}\nGiữ credit theo độ dài (\`ai_cost.story_text.<length>\`), đặt truyện \`generating\`, đẩy job vào queue và trả ngay \`202\`. ` +
        'Frontend gọi `GET /stories/{id}/generation` mỗi 2–3 giây tới khi `succeeded` / `failed` / `blocked`. ' +
        'Thành công: credit được tính, truyện `ready`, chữ, điểm dừng và phương án được ghi vào DB. Thất bại: credit được hoàn, truyện về trạng thái tính lại từ các trang.\n\n' +
        'Mã lỗi: `402` không đủ credit · `409` truyện đang sinh, hoặc đã có bé đọc (không viết lại được) · `422` truyện `custom` · ' +
        '`503` không đẩy được job vào queue (timeout 5 giây, credit đã hoàn).',
      security: bearer,
      parameters: [idParam],
      responses: {
        202: resp('AI đang viết truyện', {
          success: true,
          message: 'AI đang viết truyện',
          data: { aiRequestId: 'f0e1d2c3-0000-4000-8000-000000000abc' },
        }),
        401: err('Chưa đăng nhập'),
        402: err('Không đủ credit'),
        403: err('Không phải chủ truyện'),
        404: err('Không tìm thấy truyện'),
        409: err('Truyện đang được AI viết, hoặc đã được bé đọc nên không thể viết lại'),
        422: err('Truyện tự viết (`custom`) không dùng được AI viết chữ'),
        503: err('Hệ thống AI tạm gián đoạn (không đẩy được job vào queue trong 5 giây); credit đã được hoàn lại'),
      },
    },
  },

  '/stories/{id}/images': {
    post: {
      tags: ['Stories'],
      summary: '[Parent] Bật tranh AI và vẽ mọi cảnh còn thiếu',
      description:
        `${OWNER}
Đặt \`useAiImage = true\`, vẽ chân dung cho nhân vật chưa có (\`ai_cost.character_portrait\`), rồi mỗi cảnh có mô tả một job \`scene_image\` (\`ai_cost.scene_image\`). Cảnh có nhân vật đang vẽ chân dung thì chờ (\`imageStatus = queued\`) và tự chạy khi chân dung xong. Truyện AI viết xong chữ thì worker tự gọi bước này khi truyện bật tranh.

Trả 202 \`{ portraits, scenes, waiting, insufficientCredit }\`. 409 khi AI đang viết chữ; 402 khi không đủ credit cho ảnh nào.`,
      security: bearer,
      parameters: [idParam],
      responses: {
        202: resp('Đã xếp hàng', { success: true, data: { portraits: 1, scenes: 0, waiting: 3, insufficientCredit: false } }),
        402: err('Không đủ credit'),
        404: err('Không tìm thấy truyện'),
        409: err('AI đang viết truyện'),
      },
    },
  },
  '/stories/{id}/scenes/{sceneId}/image': {
    post: {
      tags: ['Stories'],
      summary: '[Parent] Vẽ lại tranh một cảnh',
      description: `${OWNER}
Giữ \`ai_cost.scene_image\` credit và vẽ lại cảnh (kể cả đã có tranh). 409 đang vẽ; 422 cảnh chưa có mô tả (truyện tự viết).`,
      security: bearer,
      parameters: [idParam, { name: 'sceneId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        202: resp('Đã xếp hàng', { success: true, data: { portraits: 0, scenes: 1, waiting: 0, insufficientCredit: false } }),
        402: err('Không đủ credit'),
        409: err('Cảnh đang được vẽ'),
        422: err('Cảnh chưa có mô tả'),
      },
    },
  },
  '/stories/ai-pricing': {
    get: {
      tags: ['Stories'],
      summary: '[Parent] Bảng giá AI viết truyện theo độ dài',
      description:
        'Mỗi độ dài truyện AI (`short` / `medium` / `long`): số trang, số điểm dừng (`story_layout.<length>`) và ' +
        'số credit bị trừ khi bắt đầu viết (`ai_cost.story_text.<length>`, Admin chỉnh ở Cấu hình AI). ' +
        'Trang tạo truyện dùng để báo giá trước cho ba mẹ.',
      security: bearer,
      responses: {
        200: resp('Bảng giá', {
          success: true,
          data: {
            images: { characterPortrait: 1, scene: 1, maxScenes: 4 },
            lengths: [
              { length: 'short', pages: 6, checkpoints: 3, credits: 1 },
              { length: 'medium', pages: 8, checkpoints: 4, credits: 2 },
              { length: 'long', pages: 10, checkpoints: 5, credits: 3 },
            ],
          },
        }),
        401: err('Chưa đăng nhập'),
      },
    },
  },
  '/stories/{id}/generation': {
    get: {
      tags: ['Stories'],
      summary: '[Parent] Trạng thái lần sinh chữ mới nhất',
      description:
        `${OWNER}\nTrả \`{ generation }\`: yêu cầu AI sinh chữ mới nhất của truyện, hoặc \`null\` nếu chưa sinh lần nào. ` +
        '`errorCode` và `errorMessage` được tách từ chuỗi lưu dạng `<CODE>: <message>` (`null` khi không lỗi). ' +
        'Job `queued`/`processing` quá 10 phút được coi là kẹt và được dọn ngay khi gọi endpoint này (hoàn credit, `failed`).\n\n' +
        '`status`: `queued` · `processing` · `succeeded` · `failed` · `blocked` (`SAFETY_BLOCKED`, `FORBIDDEN_TERM_DETECTED`).',
      security: bearer,
      parameters: [idParam],
      responses: {
        200: resp('Trạng thái sinh chữ', {
          success: true,
          data: {
            generation: {
              aiRequestId: 'f0e1d2c3-0000-4000-8000-000000000abc',
              status: 'failed',
              errorCode: 'TIMEOUT',
              errorMessage: 'AI không phản hồi kịp',
              createdAt: '2026-09-30T08:00:00.000Z',
              finishedAt: '2026-09-30T08:02:10.000Z',
            },
          },
        }),
        401: err('Chưa đăng nhập'),
        403: err('Không phải chủ truyện'),
        404: err('Không tìm thấy truyện'),
      },
    },
  },
};

export default storiesPaths;
